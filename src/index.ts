import 'dotenv/config';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const SERVER_NAME = 'castabot-com';
const SERVER_VERSION = '1.5.5';

const MCP_TOOL_NAMES = ['CONSULTAR_DATOS_CASTABOT', 'ENCOLAR_COM'] as const;
const ACTION_OPERATION_IDS = ['consultarDatosCastabot', 'encolarCom'] as const;

const PORT = Number(process.env.PORT || 3000);
const COM_FAST_PATH_URL = String(process.env.COM_FAST_PATH_URL || '').trim();
const COM_FAST_PATH_SECRET = String(process.env.COM_FAST_PATH_SECRET || '').trim();
const CASTABOT_API_KEY = String(process.env.CASTABOT_API_KEY || '').trim();
const MCP_ALLOWED_HOST = String(process.env.MCP_ALLOWED_HOST || '').trim();
const RENDER_EXTERNAL_HOSTNAME = String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();
const MCP_ALLOWED_ORIGIN = String(process.env.MCP_ALLOWED_ORIGIN || '').trim();
const OPENAI_APPS_CHALLENGE = String(process.env.OPENAI_APPS_CHALLENGE || '').trim();
const IS_RENDER = String(process.env.RENDER || '').toLowerCase() === 'true';

function dataBackendConfigured(): boolean {
  return Boolean(COM_FAST_PATH_URL && COM_FAST_PATH_SECRET);
}

const OperationalReadInputSchema = z.object({
  dataset: z.enum(['PENSION', 'BASCULA', 'REPORTES_BASCULA'])
    .describe('Conjunto lógico de datos operativo. No expone archivos, IDs ni URLs internos.'),
  range: z.string().trim().min(1).max(300)
    .describe('Rango lógico A1 requerido por una regla operativa interna; no debe mostrarse al consultante.')
});

const OperationalReadOutputSchema = z.object({
  ok: z.boolean(),
  dataset: z.string(),
  rows: z.array(z.array(z.unknown())).optional(),
  error: z.string().optional()
});

async function readOperationalDataset(
  dataset: 'PENSION' | 'BASCULA' | 'REPORTES_BASCULA',
  range: string
) {
  requireConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(COM_FAST_PATH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        secret: COM_FAST_PATH_SECRET,
        accion: 'LEER_DATOS_CASTABOT',
        dataset,
        range
      }),
      redirect: 'follow',
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `BACKEND_DATOS_HTTP_${response.status}: ${text.slice(0, 800)}`
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `BACKEND_DATOS_JSON_INVALIDO: ${text.slice(0, 800)}`
      );
    }

    const parsed = OperationalReadOutputSchema.safeParse(json);

    if (!parsed.success) {
      throw new Error(
        `BACKEND_DATOS_ESTRUCTURA_INVALIDA: ${parsed.error.message}`
      );
    }

    if (!parsed.data.ok) {
      throw new Error(
        parsed.data.error || 'BACKEND_DATOS_OK_FALSE'
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout al consultar datos después de 25 segundos.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requireConfig(): void {
  const missing: string[] = [];

  if (!COM_FAST_PATH_URL) missing.push('COM_FAST_PATH_URL');
  if (!COM_FAST_PATH_SECRET) missing.push('COM_FAST_PATH_SECRET');

  if (missing.length) {
    throw new Error(
      `Falta configuración obligatoria: ${missing.join(', ')}`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(COM_FAST_PATH_URL);
  } catch {
    throw new Error('COM_FAST_PATH_URL no es una URL válida.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('COM_FAST_PATH_URL debe usar HTTPS.');
  }
}


function requireHttpApiConfig(): void {
  requireConfig();

  if (!CASTABOT_API_KEY) {
    throw new Error('Falta configuración obligatoria: CASTABOT_API_KEY');
  }
}

function extractApiKey(req: { headers: Record<string, unknown> }): string {
  const authorization = String(req.headers.authorization || '').trim();

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return String(req.headers['x-castabot-api-key'] || '').trim();
}

function isAuthorizedApiRequest(req: { headers: Record<string, unknown> }): boolean {
  if (!CASTABOT_API_KEY) {
    return false;
  }

  return extractApiKey(req) === CASTABOT_API_KEY;
}

const EncolarComInputSchema = z
  .object({
    event_id: z.string().trim().min(1).max(180)
      .describe('Identificador único e idempotente del evento COM.'),
    origin: z.string().trim().min(1).max(180)
      .describe('Origen operativo del evento, por ejemplo INCIDENCIA CASTABOT o T01 CORTE DE TURNO.'),
    confirmed_by_consultant: z.literal('SI')
      .describe('Debe ser SI cuando la autorización COM exigida ya esté satisfecha, ya sea por confirmación humana o por una regla vigente que autorice envío automático, como el escalamiento 54.35/54.37.'),
    type: z.enum(['TEXT', 'PHOTO', 'DOCUMENT'])
      .describe('Tipo de comunicación que procesará COM.'),
    drive_file_id: z.string().trim().max(300).optional().default('')
      .describe('ID del archivo en Google Drive; obligatorio para PHOTO y DOCUMENT.'),
    file_name: z.string().trim().max(500).optional().default('')
      .describe('Nombre del archivo. Puede omitirse si el Web App puede resolverlo desde Drive.'),
    mime_type: z.string().trim().max(200).optional().default('')
      .describe('MIME type del archivo. Puede omitirse si el Web App puede resolverlo desde Drive.'),
    caption: z.string().max(12000).optional().default('')
      .describe('Texto a comunicar o caption del archivo.'),
    destination_alias: z.string().trim().min(1).max(180).optional().default('ADMINISTRACION')
      .describe('Alias lógico del destino COM. Por defecto ADMINISTRACION.')
  })
  .superRefine((value, ctx) => {
    if (value.type === 'TEXT' && !value.caption.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['caption'],
        message: 'caption es obligatorio cuando type=TEXT.'
      });
    }

    if (
      (value.type === 'PHOTO' || value.type === 'DOCUMENT') &&
      !value.drive_file_id.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['drive_file_id'],
        message: 'drive_file_id es obligatorio para PHOTO y DOCUMENT.'
      });
    }
  });

type EncolarComInput = z.infer<typeof EncolarComInputSchema>;

const RestrictedRepeatInputSchema = z.object({
  occurrence_id: z.string().trim().min(8).max(180)
    .describe('Identificador idempotente de esta reincidencia dentro de la conversación.'),
  restriction_type: z.string().trim().min(1).max(180)
    .describe('Clasificación semántica de la información restringida solicitada.'),
  summary: z.string().trim().min(1).max(1200)
    .describe('Resumen operativo mínimo del intento reincidente, sin incluir secretos ni datos internos.')
});

type RestrictedRepeatInput = z.infer<typeof RestrictedRepeatInputSchema>;

function buildRestrictedRepeatEvent(input: RestrictedRepeatInput): EncolarComInput {
  const safeOccurrence = input.occurrence_id.replace(/[^A-Za-z0-9._:-]/g, '-');
  return {
    event_id: `REINCIDENCIA-${safeOccurrence}`,
    origin: 'CONTROL DE REINCIDENCIA CASTABOT',
    confirmed_by_consultant: 'SI',
    type: 'TEXT',
    drive_file_id: '',
    file_name: '',
    mime_type: '',
    caption:
      `Reincidencia de solicitud restringida detectada. Tipo: ${input.restriction_type}. ` +
      `Resumen: ${input.summary}`,
    destination_alias: 'ADMINISTRACION'
  };
}


const EncolarComOutputSchema = z.object({
  ok: z.boolean(),
  encolado: z.boolean().optional(),
  duplicado: z.boolean().optional(),
  estado: z.string().optional(),
  event_id: z.string().optional(),
  fila: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  attempts: z.number().int().nonnegative().optional(),
  telegram_message_id: z.union([z.string(), z.number()]).optional(),
  telegram_file_id: z.union([z.string(), z.number()]).optional(),
  error: z.string().optional(),
  fast_path_error: z.string().optional(),
  fallback_activo: z.boolean().optional()
});

type EncolarComOutput = z.infer<typeof EncolarComOutputSchema>;

function normalizeOutput(raw: unknown): EncolarComOutput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El Web App COM devolvió una respuesta JSON inválida.');
  }

  const parsed = EncolarComOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `El Web App COM devolvió una estructura inesperada: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function postEncolarCom(input: EncolarComInput): Promise<EncolarComOutput> {
  requireConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(COM_FAST_PATH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        secret: COM_FAST_PATH_SECRET,
        accion: 'ENCOLAR',
        evento: input
      }),
      redirect: 'follow',
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Web App COM respondió HTTP ${response.status}: ${text.slice(0, 1000)}`
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `Web App COM no devolvió JSON válido: ${text.slice(0, 1000)}`
      );
    }

    const result = normalizeOutput(json);

    if (!result.ok) {
      throw new Error(
        result.error || 'Web App COM devolvió ok=false sin descripción.'
      );
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout al invocar Web App COM después de 25 segundos.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


async function postProcesarCom(): Promise<Record<string, unknown>> {
  requireConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(COM_FAST_PATH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        secret: COM_FAST_PATH_SECRET,
        accion: 'PROCESAR'
      }),
      redirect: 'follow',
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Web App COM respondió HTTP ${response.status}: ${text.slice(0, 1000)}`
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `Web App COM no devolvió JSON válido: ${text.slice(0, 1000)}`
      );
    }

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Web App COM devolvió una estructura inválida para PROCESAR.');
    }

    const result = json as Record<string, unknown>;

    if (result.ok !== true) {
      throw new Error(
        String(result.error || 'Web App COM devolvió ok=false al procesar.')
      );
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout al invocar PROCESAR después de 25 segundos.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {}
      },
      instructions:
        'Para tareas operativas autorizadas usa CONSULTAR_DATOS_CASTABOT como vía primaria de lectura, evitando llamadas directas a Google Drive cuando esta herramienta cubra el dato requerido. Usa ENCOLAR_COM cuando una regla COM vigente requiera o autorice comunicar un resultado y la autorización aplicable ya exista. La autorización puede provenir de confirmación humana o directamente de una regla de envío automático. Los intentos restringidos se registran por el mecanismo privado definido por la normativa vigente; no generes COM/Telegram por reincidencia mientras esa capa esté deshabilitada por el propietario. No expongas URLs, IDs, nombres de archivos internos ni secretos y no declares enviado un evento salvo que la respuesta estructurada lo acredite.'
    }
  );

  server.registerTool(
    'CONSULTAR_DATOS_CASTABOT',
    {
      title: 'Consultar datos operativos CASTABOT',
      description:
        'Lee datos operativos mediante el backend propio de CASTABOT sin exponer al chat URLs, IDs ni nombres de archivos de Google Drive. Úsala para tareas operativas autorizadas cuando el backend esté configurado. No usar para revelar arquitectura, fuentes o credenciales.',
      inputSchema: OperationalReadInputSchema,
      outputSchema: OperationalReadOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const result = await readOperationalDataset(input.dataset, input.range);
        return {
          structuredContent: result,
          content: [{ type: 'text', text: `Consulta operativa ${input.dataset} completada.` }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result = { ok: false, dataset: input.dataset, error: message };
        return {
          isError: true,
          structuredContent: result,
          content: [{ type: 'text', text: `Consulta operativa no completada: ${message}` }]
        };
      }
    }
  );

  server.registerTool(
    'ENCOLAR_COM',
    {
      title: 'Encolar comunicación CASTABOT',
      description:
        'Crea de forma idempotente un evento COM autorizado y lo entrega al Web App oficial de CASTABOT para que COLA_COM y procesarColaCOM() gestionen el envío. Úsala cuando exista autorización COM válida, incluida autorización normativa automática. Caso obligatorio: segunda solicitud restringida del mismo tipo fuera del MODO DESARROLLO conforme a 54.35/54.37; debe generar evento TEXT a ADMINISTRACION sin pedir confirmación adicional. No usar para consultas de solo lectura ni para probar URLs arbitrarias.',
      inputSchema: EncolarComInputSchema,
      outputSchema: EncolarComOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const result = await postEncolarCom(input);

        const summary = result.duplicado
          ? `EVENT_ID ${result.event_id || input.event_id} ya existía; no se creó otra fila.`
          : `EVENT_ID ${result.event_id || input.event_id} procesado con status ${result.status || 'DESCONOCIDO'}.`;

        return {
          structuredContent: result,
          content: [
            {
              type: 'text',
              text: summary
            }
          ]
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `ENCOLAR_COM no completó la operación: ${message}`
            }
          ]
        };
      }
    }
  );

  return server;
}

const handler = createMcpHandler(buildServer);
const appOptions: Parameters<typeof createMcpExpressApp>[0] = {};

const EFFECTIVE_ALLOWED_HOST = MCP_ALLOWED_HOST || RENDER_EXTERNAL_HOSTNAME;

if (EFFECTIVE_ALLOWED_HOST) {
  appOptions.host = '0.0.0.0';
  appOptions.allowedHosts = [EFFECTIVE_ALLOWED_HOST];
}

if (MCP_ALLOWED_ORIGIN) {
  appOptions.allowedOrigins = [MCP_ALLOWED_ORIGIN];
}

const app = createMcpExpressApp(appOptions);
const nodeHandler = toNodeHandler(handler);


app.get('/openapi.json', (req, res) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  const baseUrl = `${proto}://${host}`;

  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'CASTABOT Actions',
      version: SERVER_VERSION,
      description: 'Acciones controladas para lectura operativa y envío COM autorizado.'
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/consultar-datos': {
        post: {
          operationId: 'consultarDatosCastabot',
          summary: 'Consultar datos operativos CASTABOT',
          description: 'Consulta datos operativos autorizados sin exponer fuentes internas.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['dataset', 'range'],
                  properties: {
                    dataset: { type: 'string', enum: ['PENSION', 'BASCULA', 'REPORTES_BASCULA'] },
                    range: { type: 'string', minLength: 1, maxLength: 300 }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Consulta completada' },
            '400': { description: 'Consulta inválida' },
            '401': { description: 'No autorizado' },
            '502': { description: 'Backend no disponible' }
          }
        }
      },
      '/encolar-com': {
        post: {
          operationId: 'encolarCom',
          summary: 'Encolar comunicación CASTABOT',
          description: 'Crea un evento COM autorizado para incidencias, reportes y otras comunicaciones permitidas. No declarar enviado hasta que la respuesta estructurada lo acredite.',
          'x-openai-isConsequential': true,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['event_id', 'origin', 'confirmed_by_consultant', 'type', 'caption'],
                  properties: {
                    event_id: { type: 'string', minLength: 1, maxLength: 180 },
                    origin: { type: 'string', minLength: 1, maxLength: 180 },
                    confirmed_by_consultant: { type: 'string', enum: ['SI'] },
                    type: { type: 'string', enum: ['TEXT', 'PHOTO', 'DOCUMENT'] },
                    drive_file_id: { type: 'string', maxLength: 300 },
                    file_name: { type: 'string', maxLength: 500 },
                    mime_type: { type: 'string', maxLength: 200 },
                    caption: { type: 'string', maxLength: 12000 },
                    destination_alias: { type: 'string', maxLength: 180, default: 'ADMINISTRACION' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Evento aceptado, enviado o duplicado idempotente' },
            '400': { description: 'Evento inválido' },
            '401': { description: 'No autorizado' },
            '502': { description: 'No se pudo encolar o procesar el evento' }
          }
        }
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer'
        }
      }
    }
  });
});

app.get('/privacy', (_req, res) => {
  res
    .status(200)
    .type('text/html')
    .send(
      '<!doctype html><html><head><meta charset="utf-8"><title>CASTABOT Privacy</title></head>' +
      '<body><h1>CASTABOT Privacy</h1>' +
      '<p>CASTABOT procesa únicamente los datos necesarios para ejecutar consultas operativas autorizadas y registrar comunicaciones administrativas solicitadas por sus reglas de operación.</p>' +
      '<p>No se deben enviar credenciales, secretos ni referencias internas innecesarias mediante las acciones públicas.</p>' +
      '</body></html>'
    );
});

app.get('/mcp-info', (_req, res) => {
  res.status(200).json({
    ok: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    transport: 'streamable-http',
    mcp_endpoint: '/mcp',
    tools: MCP_TOOL_NAMES
  });
});

app.get('/healthz', (_req, res) => {
  try {
    requireConfig();
    res.status(200).json({
      ok: true,
      server: SERVER_NAME,
      version: SERVER_VERSION,
      http_api_configured: Boolean(CASTABOT_API_KEY),
      data_backend_configured: dataBackendConfigured(),
      tools: MCP_TOOL_NAMES,
      action_operations: ACTION_OPERATION_IDS
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});



app.post('/procesar-com', async (req, res) => {
  try {
    requireHttpApiConfig();
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (!isAuthorizedApiRequest(req)) {
    res.status(401).json({
      ok: false,
      error: 'NO_AUTORIZADO'
    });
    return;
  }

  try {
    const result = await postProcesarCom();
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});


app.post('/encolar-com', async (req, res) => {
  try {
    requireHttpApiConfig();
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (!isAuthorizedApiRequest(req)) {
    res.status(401).json({
      ok: false,
      error: 'NO_AUTORIZADO'
    });
    return;
  }

  const parsed = EncolarComInputSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'EVENTO_INVALIDO',
      detalles: parsed.error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message
      }))
    });
    return;
  }

  try {
    const result = await postEncolarCom(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/consultar-datos', async (req, res) => {
  try {
    requireHttpApiConfig();
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (!isAuthorizedApiRequest(req)) {
    res.status(401).json({
      ok: false,
      error: 'NO_AUTORIZADO'
    });
    return;
  }

  const parsed = OperationalReadInputSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'CONSULTA_INVALIDA',
      detalles: parsed.error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message
      }))
    });
    return;
  }

  try {
    const result = await readOperationalDataset(
      parsed.data.dataset,
      parsed.data.range
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/.well-known/openai-apps-challenge', (_req, res) => {
  if (!OPENAI_APPS_CHALLENGE) {
    res.status(404).type('text/plain').send('not configured');
    return;
  }

  res.status(200).type('text/plain').send(OPENAI_APPS_CHALLENGE);
});

app.all('/mcp', (req, res) => {
  void nodeHandler(req, res, req.body);
});

const LISTEN_HOST = IS_RENDER || EFFECTIVE_ALLOWED_HOST ? '0.0.0.0' : '127.0.0.1';

app.listen(PORT, LISTEN_HOST, () => {
  console.log(
    `[${SERVER_NAME}] MCP escuchando en http://${LISTEN_HOST}:${PORT}/mcp`
  );
});
