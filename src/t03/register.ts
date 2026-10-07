import * as z from 'zod/v4';
import type { ExecuteT03Success } from './execute.js';

const RegisterResponseSchema = z.object({
  ok: z.literal(true),
  registrado: z.boolean(),
  duplicado: z.boolean(),
  registro_id: z.string().min(1),
  consulta_id: z.string().min(1),
  fila: z.number().int().positive(),
  control_relectura: z.literal('SI'),
  panel_actualizado: z.literal(true),
});

export type T03RegisterResponse = z.infer<typeof RegisterResponseSchema>;

function observation(result: ExecuteT03Success): string {
  const difference = result.analysis.difference_kg;

  if (difference === 0) {
    return 'Peso actual coincide con el promedio histórico.';
  }

  const relation = difference > 0 ? 'por arriba' : 'por debajo';

  return [
    `Peso actual ${relation} del promedio histórico.`,
    `Variación ${result.analysis.variation_percent_display} %.`,
  ].join(' ');
}

export async function registerT03Result(args: {
  url: string;
  secret: string;
  result: ExecuteT03Success;
  consultanteResponsable?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<T03RegisterResponse> {
  const url = args.url.trim();
  const secret = args.secret.trim();

  if (!url || !secret) {
    throw new Error('T03_REGISTER_BACKEND_NOT_CONFIGURED');
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('T03_REGISTER_BACKEND_URL_MUST_BE_HTTPS');
  }

  const a = args.result.analysis;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? 25_000,
  );

  try {
    const response = await (args.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        secret,
        accion: 'REGISTRAR_T03_CASTABOT',
        registro: {
          registro_id: args.result.event_id,
          consulta_id: args.result.consulta_id,
          identificador_solicitado: args.result.unit.identifier_value,
          matricula: args.result.identity.matricula,
          numero_economico: args.result.identity.numero_economico,
          tipo_peso: a.weight_type === 'BRUTO' ? 'PESO BRUTO' : 'PESO TARA',
          peso_actual_kg: a.current_weight_kg,
          promedio_historico_kg: a.historical_average_internal,
          diferencia_kg: a.difference_kg,
          variacion_pct: a.variation_percent_internal,
          registros_comparables: args.result.valid_count,
          clasificacion_rango:
            a.status === 'FUERA_DE_RANGO'
              ? 'FUERA DE RANGO'
              : 'DENTRO DE RANGO',
          decision_t03:
            a.decision === 'CONSULTAR_ADMINISTRADOR'
              ? 'CONSULTAR CON ADMINISTRADOR ANTES DE PESAR'
              : 'APROBADO PARA PESAR',
          observacion: observation(args.result),
          fuente_resultado:
            args.result.data.source_class === 'AUTHORIZED_FALLBACK'
              ? 'BASCULA Y PENSION 2026 / SOFTWARE BASCULA'
              : 'REPORTES DE BASCULA 2026',
          consultante_responsable:
            args.consultanteResponsable?.trim() || '',
        },
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`T03_REGISTER_BACKEND_HTTP_${response.status}`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('T03_REGISTER_BACKEND_JSON_INVALIDO');
    }

    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).ok === false
    ) {
      throw new Error(
        String(
          (raw as Record<string, unknown>).error ||
            'T03_REGISTER_BACKEND_OK_FALSE',
        ),
      );
    }

    const parsed = RegisterResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `T03_REGISTER_BACKEND_RESPONSE_INVALID: ${parsed.error.message}`,
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('T03_REGISTER_BACKEND_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
