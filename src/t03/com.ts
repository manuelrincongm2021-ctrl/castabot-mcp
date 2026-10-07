import type { ExecuteT03Success } from './execute.js';

export type T03ComProducerResult = {
  ok: boolean;
  duplicado?: boolean;
  status?: string;
  telegram_message_id?: string | number;
};

export function buildT03ComCaption(result: ExecuteT03Success): string {
  const a = result.analysis;
  return [
    'T03 — CONSULTA DE PESOS PROMEDIO',
    `CONSULTA_ID: ${result.consulta_id}`,
    `IDENTIFICADOR: ${result.unit.identifier_value}`,
    `TIPO DE PESO: ${a.weight_type}`,
    `PESO ACTUAL: ${a.current_weight_kg} kg`,
    `PROMEDIO HISTÓRICO: ${a.historical_average_display_kg} kg`,
    `DIFERENCIA: ${a.difference_kg} kg`,
    `VARIACIÓN: ${a.variation_percent_display} %`,
    `REGISTROS COMPARABLES: ${result.valid_count}`,
    `CLASIFICACIÓN: ${a.status}`,
    `DECISIÓN: ${a.decision}`,
  ].join('\n');
}

function isAccredited(result: T03ComProducerResult): boolean {
  return (
    result.ok === true &&
    String(result.status || '').toUpperCase() === 'ENVIADO' &&
    Boolean(result.telegram_message_id)
  );
}

export async function deliverT03Com(args: {
  result: ExecuteT03Success;
  producer: (event: {
    event_id: string;
    origin: string;
    confirmed_by_consultant: 'SI';
    type: 'TEXT';
    caption: string;
    destination_alias: 'ADMINISTRACION';
  }) => Promise<T03ComProducerResult>;
  processQueue?: () => Promise<unknown>;
}) {
  const event = {
    event_id: args.result.event_id,
    origin: 'T03 PESO PROMEDIO',
    confirmed_by_consultant: 'SI' as const,
    type: 'TEXT' as const,
    caption: buildT03ComCaption(args.result),
    destination_alias: 'ADMINISTRACION' as const,
  };

  const first = await args.producer(event);
  if (isAccredited(first)) {
    return {
      accredited: true as const,
      status: 'ENVIADO' as const,
    };
  }

  if (args.processQueue) {
    await args.processQueue();
  }

  const second = await args.producer(event);

  return {
    accredited: isAccredited(second),
    status: String(second.status || '').toUpperCase() || 'NO_ACREDITADO',
  };
}
