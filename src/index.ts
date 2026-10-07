import 'dotenv/config';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { deriveFeatureSecret } from './security/derive.js';
import { runT03Prestart } from './prestart/service.js';
import { fetchT03SearchWithFallback } from './t03/backend.js';
import { executeT03FromSearch } from './t03/execute.js';
import { deliverT03Com } from './t03/com.js';
import { registerT03Result } from './t03/register.js';

const SERVER_NAME = 'castabot-com';
const SERVER_VERSION = '1.5.14';

const BASE_MCP_TOOL_NAMES = ['CONSULTAR_DATOS_CASTABOT', 'ENCOLAR_COM'] as const;
const BASE_ACTION_OPERATION_IDS = ['consultarDatosCastabot', 'encolarCom'] as const;

const PORT = Number(process.env.PORT || 3000);
const COM_FAST_PATH_URL = String(process.env.COM_FAST_PATH_URL || '').trim();
const COM_FAST_PATH_SECRET = String(process.env.COM_FAST_PATH_SECRET || '').trim();
const CASTABOT_API_KEY = String(process.env.CASTABOT_API_KEY || '').trim();
const MCP_ALLOWED_HOST = String(process.env.MCP_ALLOWED_HOST || '').trim();
const RENDER_EXTERNAL_HOSTNAME = String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();
const MCP_ALLOWED_ORIGIN = String(process.env.MCP_ALLOWED_ORIGIN || '').trim();
const OPENAI_APPS_CHALLENGE = String(process.env.OPENAI_APPS_CHALLENGE || '').trim();
const IS_RENDER = String(process.env.RENDER || '').toLowerCase() === 'true';
const T03_DETERMINISTIC_ENABLED = String(process.env.CASTABOT_T03_DETERMINISTIC_ENABLED || '').toLowerCase() === 'true';
const T03_PRESTART_TTL_SECONDS = Number(process.env.CASTABOT_PRESTART_TTL_SECONDS || 600);

const MCP_TOOL_NAMES = T03_DETERMINISTIC_ENABLED
  ? [...BASE_MCP_TOOL_NAMES, 'PREARRANQUE_CASTABOT', 'EJECUTAR_T03']
  : [...BASE_MCP_TOOL_NAMES];

const ACTION_OPERATION_IDS = T03_DETERMINISTIC_ENABLED
  ? [...BASE_ACTION_OPERATION_IDS, 'prearranqueCastabotT03', 'ejecutarT03']
  : [...BASE_ACTION_OPERATION_IDS];

function dataBackendConfigured(): boolean {
  return Boolean(COM_FAST_PATH_URL && COM_FAST_PATH_SECRET);
}

function requireT03Feature(): void {
  if (!T03_DETERMINISTIC_ENABLED) {
    throw new Error('T03_DETERMINISTIC_DISABLED');
  }
  if (!Number.isFinite(T03_PRESTART_TTL_SECONDS) || T03_PRESTART_TTL_SECONDS <= 0) {
    throw new Error('CASTABOT_PRESTART_TTL_SECONDS_INVALID');
  }
}

function t03PrestartSecret(): string {
  return deriveFeatureSecret(COM_FAST_PATH_SECRET, 'T03_PRESTART_V1');
}

function t03IdempotencySecret(): string {
  return deriveFeatureSecret(COM_FAST_PATH_SECRET, 'T03_IDEMPOTENCY_V1');
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

const T03ContextInputSchema = z.object({
  identifier_type: z.enum(['MATRICULA', 'NUMERO_ECONOMICO']),
  identifier_value: z.string().trim().min(1).max(180),
  weight_type: z.enum(['BRUTO', 'TARA']),
  current_weight_kg: z.number().finite().positive()
});

const T03PrestartInputSchema = z.object({
  mode: z.literal('OPERATIVO'),
  task: z.literal('T03'),
  ...T03ContextInputSchema.shape
});

const T03ExecuteInputSchema = z.object({
  prestart_token: z.string().trim().min(1),
  ...T03ContextInputSchema.shape,
  consultante_responsable: z.string().trim().max(180).optional()
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


function t03OpenApiPaths(): Record<string, unknown> {
  if (!T03_DETERMINISTIC_ENABLED) {
    return {};
  }

  const contextProperties = {
    identifier_type: {
      type: 'string',
      enum: ['MATRICULA', 'NUMERO_ECONOMICO']
    },
    identifier_value: {
      type: 'string',
      minLength: 1,
      maxLength: 180
    },
    weight_type: {
      type: 'string',
      enum: ['BRUTO', 'TARA']
    },
    current_weight_kg: {
      type: 'number',
      exclusiveMinimum: 0
    }
  };

  return {
    '/prearranque-t03': {
      post: {
        operationId: 'prearranqueCastabotT03',
        summary: 'Acreditar prearranque T03',
        description:
          'Ejecuta el gate técnico previo a T03. No calcula el promedio ni produce COM.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'mode',
                  'task',
                  'identifier_type',
                  'identifier_value',
                  'weight_type',
                  'current_weight_kg'
                ],
                properties: {
                  mode: { type: 'string', enum: ['OPERATIVO'] },
                  task: { type: 'string', enum: ['T03'] },
                  ...contextProperties
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Prearranque acreditado' },
          '400': { description: 'Entrada inválida' },
          '401': { description: 'No autorizado' },
          '502': { description: 'Prearranque no acreditado' }
        }
      }
    },
    '/ejecutar-t03': {
      post: {
        operationId: 'ejecutarT03',
        summary: 'Ejecutar T03 determinista',
        description:
          'Valida el token de prearranque, consulta históricos, calcula T03, produce COM idempotente y postregistra solo tras acreditar la entrega.',
        'x-openai-isConsequential': true,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'prestart_token',
                  'identifier_type',
                  'identifier_value',
                  'weight_type',
                  'current_weight_kg'
                ],
                properties: {
                  prestart_token: {
                    type: 'string',
                    minLength: 1
                  },
                  ...contextProperties,
                  consultante_responsable: {
                    type: 'string',
                    maxLength: 180
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'T03 calculado; revisar acreditación COM/postregistro en respuesta estructurada' },
          '400': { description: 'Entrada inválida' },
          '401': { description: 'No autorizado' },
          '409': { description: 'Gate o cálculo bloqueado' },
          '502': { description: 'Backend T03 no disponible' }
        }
      }
    }
  };
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

async function probeT03DataRoute(): Promise<boolean> {
  try {
    const result = await readOperationalDataset(
      'REPORTES_BASCULA',
      'PROGRAMA!A1:P1'
    );
    return result.ok === true;
  } catch {
    return false;
  }
}

async function executePrestartT03(input: z.infer<typeof T03PrestartInputSchema>) {
  requireConfig();
  requireT03Feature();

  return runT03Prestart({
    backendUrl: COM_FAST_PATH_URL,
    backendSecret: COM_FAST_PATH_SECRET,
    tokenSecret: t03PrestartSecret(),
    context: {
      identifierType: input.identifier_type,
      identifierValue: input.identifier_value,
      weightType: input.weight_type,
      currentWeightKg: input.current_weight_kg
    },
    dataRouteProbe: probeT03DataRoute,
    ttlSeconds: T03_PRESTART_TTL_SECONDS
  });
}

async function executeT03Protected(input: z.infer<typeof T03ExecuteInputSchema>) {
  requireConfig();
  requireT03Feature();

  const search = await fetchT03SearchWithFallback({
    url: COM_FAST_PATH_URL,
    secret: COM_FAST_PATH_SECRET,
    input: {
      identifierType: input.identifier_type,
      identifierValue: input.identifier_value
    }
  });

  const execution = executeT03FromSearch({
    prestartToken: input.prestart_token,
    prestartSecret: t03PrestartSecret(),
    idempotencySecret: t03IdempotencySecret(),
    identifierType: input.identifier_type,
    identifierValue: input.identifier_value,
    weightType: input.weight_type,
    currentWeightKg: input.current_weight_kg,
    rawSearchResponse: search
  });

  if (!execution.ok) {
    return execution;
  }

  const delivery = await deliverT03Com({
    result: execution,
    producer: async (event) =>
      postEncolarCom({
        ...event,
        drive_file_id: '',
        file_name: '',
        mime_type: ''
      }),
    processQueue: postProcesarCom
  });

  let postregister:
    | {
        required: true;
        completed: true;
        duplicado: boolean;
        control_relectura: 'SI';
        panel_actualizado: true;
      }
    | {
        required: true;
        completed: false;
        code: string;
      };

  if (!delivery.accredited) {
    postregister = {
      required: true,
      completed: false,
      code: 'COM_NOT_ACCREDITED'
    };
  } else {
    try {
      const registered = await registerT03Result({
        url: COM_FAST_PATH_URL,
        secret: COM_FAST_PATH_SECRET,
        result: execution,
        consultanteResponsable: input.consultante_responsable
      });

      postregister = {
        required: true,
        completed: true,
        duplicado: registered.duplicado,
        control_relectura: registered.control_relectura,
        panel_actualizado: true
      };
    } catch {
      postregister = {
        required: true,
        completed: false,
        code: 'T03_POSTREGISTER_NOT_ACCREDITED'
      };
    }
  }

  return {
    ...execution,
    com_delivery: {
      required: true,
      accredited: delivery.accredited,
      status: delivery.status
    },
    postregister,
    operational_complete:
      delivery.accredited && postregister.completed
  };
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
        'Para tareas operativas autorizadas usa CONSULTAR_DATOS_CASTABOT como vía primaria de lectura, evitando llamadas directas a Google Drive cuando esta herramienta cubra el dato requerido. En T03, si la variación absoluta supera el umbral vigente de 1.50 %, clasifica el caso como FUERA DE RANGO y activa COM automáticamente hacia ADMINISTRACION sin pedir aprobación ni confirmación al consultante. El informe automático debe ser idempotente, incluir los datos esenciales del cálculo y seguir los controles COM vigentes. Fuera de desarrollo, no expongas estados internos de COM ni solicites autorización humana adicional para este envío específico. Cuando el primer mensaje active MODO DESARROLLO y solicite diagnóstico, revisión de estado, estabilidad, incidencias pendientes o equivalente semántico, incluye PANEL_ADMIN de CASTABOT COM-S en el prearranque: relee su estructura, fórmulas y renderizado; compáralo con el canon; corrige desviaciones solo dentro de PANEL_ADMIN; vuelve a releer; y úsalo como resumen visual contrastado con las fuentes primarias antes de declarar el diagnóstico completo. En ese diagnóstico incorpora también el índice de rendimiento CASTABOT y su tendencia del modelo vigente, distinguiéndolos del gate de salud: el estado global acredita integridad/control y el índice mide carga y evolución de incidencias; ninguno sustituye la verificación de fuentes primarias. En T01, ESTADO=PROVISIONAL no autoriza formato resumido: debe conservar el formato canónico completo y añadir únicamente el bloque provisional específico para conceptos afectados. La persistencia T01 debe incluir valores Y formato visual canónico: EFECTIVO verde, TARJETA amarillo, PREPAGO gris, TRANSFERENCIA azul, EFECTIVO NETO resaltado, encabezados y secciones jerarquizados, bordes visibles, moneda, títulos/observaciones combinados, observaciones centradas con ajuste de texto y viñeta visible. Relee CellData o equivalente después de escribir para verificar formato además de valores; escribir solo valores no completa T01. Para cualquier persistencia con formato canónico visual, aplica la secuencia ESCRIBIR → RELEER CONTENIDO → RELEER FORMATO/RENDERIZADO → COMPARAR CON CANON → CORREGIR SI ES NECESARIO → RELEER DE NUEVO → VALIDAR → CERRAR. Si la primera relectura visual no cumple, corrige únicamente el bloque objetivo y vuelve a verificar antes de responder; persistido no equivale a renderizado conforme. La persistencia de T01 es histórica y acumulativa: un turno/fecha distinto se escribe en un bloque nuevo y conserva todos los T01 y reportes anteriores; solo el mismo corte lógico puede actualizar su propio bloque al evolucionar de PROVISIONAL a DEFINITIVO o recibir corrección. Antes y después de escribir, relee bloques previos controlados y no declares persistencia satisfactoria si alguno desaparece o cambia. Para T01/corte de turno, una respuesta no debe considerarse ejecución completa si faltan formato canónico, persistencia obligatoria y verificación posterior exigidas por la norma vigente. Para continuidad excepcional de turno, conserva la ventana ordinaria de 20 minutos sin ampliarla automáticamente. Fuera de esa ventana no presumas continuidad ni relevo por la hora: usa el contexto y, si existe duda material, pregunta en lenguaje sencillo si el consultante sigue a cargo, ya terminó o ya inició el siguiente turno. Interpreta semánticamente respuestas coloquiales; si son materialmente ambiguas o contradictorias, solicita una aclaración breve y mantén T01 PROVISIONAL respecto de los movimientos afectados. No confundas la presencia del siguiente encargado con un relevo efectivo y reutiliza el contexto ya establecido en solicitudes posteriores como "corte final". CONSULTAR_DATOS_CASTABOT es la vía primaria de lectura, pero no sustituye la escritura obligatoria: cuando T01 deba persistirse y no exista una acción propia de escritura CASTABOT, usa la capacidad autorizada de escritura de Google Sheets sobre el destino canónico. Antes de escribir, identifica un bloque objetivo inequívoco o una zona libre; lee el bloque y rangos adyacentes; modifica únicamente las celdas del bloque T01; no borres, desplaces, sobreescribas ni reformatees otros reportes; y relee el bloque más los rangos adyacentes para verificar que el contenido previo permanezca intacto. Si no existe un ancla segura o zona libre verificable, no ejecutes una escritura destructiva y no declares persistencia completada. Conserva la continuidad semántica del reporte activo: si después de generar un T01 el usuario dice de forma breve o ambigua \"envía reporte\", \"envíalo\" o equivalente, resuélvelo como referencia al T01 activo salvo evidencia contraria. Usa ENCOLAR_COM cuando una regla COM vigente requiera o autorice comunicar un resultado y la autorización aplicable ya exista. La autorización puede provenir de confirmación humana o directamente de una regla de envío automático. No declares enviado un evento salvo que la respuesta estructurada lo acredite. En el productor Plus por COLA_COM, si la primera relectura queda PENDIENTE, realiza al menos una relectura independiente adicional del mismo EVENT_ID antes de cerrar la respuesta cuando la sesión lo permita; PENDIENTE transitorio no equivale a fallo y ENVIADO requiere STATUS=ENVIADO más TELEGRAM_MESSAGE_ID. Fuera de MODO DESARROLLO, no expongas al consultante estados internos transitorios de COM como PENDIENTE, ENVIANDO, EVENT_ID, intentos o TELEGRAM_MESSAGE_ID. Mientras la entrega final no esté acreditada, usa un acuse neutro visible: "Reporte procesado para Administración." Si la entrega falla, queda FALLIDO, no puede acreditarse o queda bloqueada por causa operativa, normativa o técnica, genera silenciosamente una incidencia administrativa idempotente de fallo COM referenciada al mensaje original. Si COM está totalmente indisponible, persiste esa incidencia para reintento cuando COM vuelva a estar disponible; no uses canales no autorizados. Si el envío queda acreditado, responde con una confirmación operativa breve como "Reporte enviado correctamente a Administración."; si no puede acreditarse tras las verificaciones permitidas, responde de forma breve que no fue posible confirmar el envío, sin exponer la cola ni el estado interno. No declares un T01 generado y verificado si su persistencia obligatoria no fue ejecutada y comprobada. Los intentos restringidos se registran por el mecanismo privado definido por la normativa vigente; no generes COM/Telegram por reincidencia mientras esa capa esté deshabilitada por el propietario. No expongas URLs, IDs, nombres de archivos internos ni secretos.'
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
        'Crea de forma idempotente un evento COM autorizado y lo entrega al Web App oficial de CASTABOT para que COLA_COM y procesarColaCOM() gestionen el envío. Úsala cuando exista autorización COM válida, incluida autorización normativa automática. Si existe un reporte T01 activo y el usuario pide \"envía reporte\", \"envíalo\" o equivalente, conserva ese contexto y usa el contenido del T01 activo como comunicación, siempre que la fase previa exigible del reporte esté completada. No usar para consultas de solo lectura ni para probar URLs arbitrarias.',
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


  if (T03_DETERMINISTIC_ENABLED) {
    server.registerTool(
      'PREARRANQUE_CASTABOT',
      {
        title: 'Prearranque CASTABOT T03',
        description:
          'Acredita por backend el prearranque obligatorio de T03 y emite un token opaco ligado exactamente a la consulta. No calcula promedios ni produce COM.',
        inputSchema: T03PrestartInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
      },
      async (input) => {
        try {
          const result = await executePrestartT03(input);
          return {
            structuredContent: result,
            content: [{ type: 'text', text: 'Prearranque T03 acreditado.' }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            structuredContent: { ok: false, code: message },
            content: [{ type: 'text', text: 'TAREA DETENIDA — PREARRANQUE NO ACREDITADO.' }]
          };
        }
      }
    );

    server.registerTool(
      'EJECUTAR_T03',
      {
        title: 'Ejecutar T03 determinista',
        description:
          'Ejecuta T03 únicamente con prestart_token válido: consulta la fuente primaria, calcula con precisión interna, renderiza el formato canónico y produce el evento COM idempotente.',
        inputSchema: T03ExecuteInputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async (input) => {
        try {
          const result = await executeT03Protected(input);

          if (!result.ok) {
            return {
              isError: true,
              structuredContent: result,
              content: [{ type: 'text', text: result.code }]
            };
          }

          return {
            structuredContent: result,
            content: [{ type: 'text', text: result.canonical_markdown }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            structuredContent: { ok: false, code: message },
            content: [{ type: 'text', text: 'T03 no pudo completarse.' }]
          };
        }
      }
    );
  }

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
      ...t03OpenApiPaths(),
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


app.get('/openapi-plus.json', (req, res) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  const baseUrl = `${proto}://${host}`;

  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'CASTABOT Plus Actions',
      version: SERVER_VERSION,
      description: 'Puente HTTPS para GPT Actions compatible con cuentas que no disponen del MCP CASTABOT en la sesión.'
    },
    servers: [{ url: baseUrl }],
    paths: {
      ...t03OpenApiPaths(),
      '/consultar-datos': {
        post: {
          operationId: 'consultarDatosCastabot',
          summary: 'Consultar datos operativos CASTABOT',
          description: 'Consulta datos operativos autorizados. Usar como vía primaria cuando esta Action esté disponible.',
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
          summary: 'Enviar comunicación CASTABOT por COM',
          description: 'Encola una incidencia, reporte T01 u otra comunicación autorizada. Debe usarse cuando el usuario o la norma vigente autoricen el envío. No declarar enviado hasta recibir respuesta estructurada ok=true.',
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
            '200': { description: 'Evento aceptado o duplicado idempotente' },
            '400': { description: 'Evento inválido' },
            '401': { description: 'No autorizado' },
            '502': { description: 'No se pudo encolar o procesar el evento' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' }
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



app.post('/prearranque-t03', async (req, res) => {
  if (!T03_DETERMINISTIC_ENABLED) {
    res.status(404).json({ ok: false, error: 'NO_DISPONIBLE' });
    return;
  }

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
    res.status(401).json({ ok: false, error: 'NO_AUTORIZADO' });
    return;
  }

  const parsed = T03PrestartInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'PREARRANQUE_INVALIDO',
      detalles: parsed.error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message
      }))
    });
    return;
  }

  try {
    const result = await executePrestartT03(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/ejecutar-t03', async (req, res) => {
  if (!T03_DETERMINISTIC_ENABLED) {
    res.status(404).json({ ok: false, error: 'NO_DISPONIBLE' });
    return;
  }

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
    res.status(401).json({ ok: false, error: 'NO_AUTORIZADO' });
    return;
  }

  const parsed = T03ExecuteInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'T03_INVALIDO',
      detalles: parsed.error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message
      }))
    });
    return;
  }

  try {
    const result = await executeT03Protected(parsed.data);
    res.status(result.ok ? 200 : 409).json(result);
  } catch (error) {
    res.status(502).json({
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
