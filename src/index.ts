import 'dotenv/config';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const SERVER_NAME = 'castabot-com';
const SERVER_VERSION = '1.0.0';

const PORT = Number(process.env.PORT || 3000);
const COM_FAST_PATH_URL = String(process.env.COM_FAST_PATH_URL || '').trim();
const COM_FAST_PATH_SECRET = String(process.env.COM_FAST_PATH_SECRET || '').trim();
const MCP_ALLOWED_HOST = String(process.env.MCP_ALLOWED_HOST || '').trim();
const RENDER_EXTERNAL_HOSTNAME = String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();
const MCP_ALLOWED_ORIGIN = String(process.env.MCP_ALLOWED_ORIGIN || '').trim();
const OPENAI_APPS_CHALLENGE = String(process.env.OPENAI_APPS_CHALLENGE || '').trim();
const IS_RENDER = String(process.env.RENDER || '').toLowerCase() === 'true';

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

const EncolarComInputSchema = z
  .object({
    event_id: z.string().trim().min(1).max(180)
      .describe('Identificador único e idempotente del evento COM.'),
    origin: z.string().trim().min(1).max(180)
      .describe('Origen operativo del evento, por ejemplo INCIDENCIA CASTABOT o T01 CORTE DE TURNO.'),
    confirmed_by_consultant: z.literal('SI')
      .describe('Debe ser SI cuando la confirmación exigida por COM ya ocurrió.'),
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
        'Usa ENCOLAR_COM solo cuando una regla COM vigente requiera o autorice comunicar un resultado y la confirmación aplicable ya exista. No inventes EVENT_ID, no expongas secretos y no declares enviado un evento salvo que la respuesta estructurada lo acredite.'
    }
  );

  server.registerTool(
    'ENCOLAR_COM',
    {
      title: 'Encolar comunicación CASTABOT',
      description:
        'Crea de forma idempotente un evento COM autorizado y lo entrega al Web App oficial de CASTABOT para que COLA_COM y procesarColaCOM() gestionen el envío. Úsala únicamente cuando ya exista la confirmación exigida por las reglas COM. No usar para consultas de solo lectura ni para probar URLs arbitrarias.',
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

app.get('/healthz', (_req, res) => {
  try {
    requireConfig();
    res.status(200).json({
      ok: true,
      server: SERVER_NAME,
      version: SERVER_VERSION
    });
  } catch (error) {
    res.status(503).json({
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
