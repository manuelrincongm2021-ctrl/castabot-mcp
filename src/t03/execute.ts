import { deriveT03EventIdentity } from '../com/idempotency.js';
import {
  verifyPrestartToken,
  type T03PrestartContext,
} from '../prestart/token.js';
import { computeT03, renderCanonicalT03 } from './compute.js';
import {
  parseT03SearchResponse,
  toT03History,
} from './source.js';

export type ExecuteT03Blocked = {
  ok: false;
  code:
    | 'PRESTART_REQUIRED'
    | 'PRESTART_INVALID'
    | 'PRESTART_EXPIRED'
    | 'PRESTART_CONTEXT_MISMATCH'
    | 'NO_VALID_HISTORY'
    | 'HISTORY_REVIEW_REQUIRED'
    | 'INVALID_CURRENT_WEIGHT';
};

export type ExecuteT03Success = {
  ok: true;
  consulta_id: string;
  event_id: string;
  idempotency_key: string;
  unit: {
    identifier_type: 'MATRICULA' | 'NUMERO_ECONOMICO';
    identifier_value: string;
  };
  identity: {
    matricula: string | null;
    numero_economico: string | null;
    cliente: string | null;
  };
  analysis: {
    weight_type: 'BRUTO' | 'TARA';
    current_weight_kg: number;
    historical_average_internal: number;
    historical_average_display_kg: number;
    difference_kg: number;
    variation_percent_internal: number;
    variation_percent_display: string;
    threshold_percent: 1.5;
    status: 'DENTRO_DE_RANGO' | 'FUERA_DE_RANGO';
    decision: 'APROBADO_PARA_PESAR' | 'CONSULTAR_ADMINISTRADOR';
  };
  data: {
    data_status: 'VIGENTE';
    data_as_of: string | null;
    fallback_used: boolean;
    fallback_reason: string | null;
    source_class: 'PRIMARY' | 'AUTHORIZED_FALLBACK';
    policy_version: string;
  };
  com_policy: {
    operational_event_required: true;
    out_of_range_escalation_required: boolean;
    authorization_basis: string[];
  };
  canonical_markdown: string;
  valid_count: number;
  excluded_count: number;
};

function identityLine(records: ReturnType<typeof toT03History>, fallback: string): string {
  const first = records[0];
  if (!first) return fallback;

  const parts: string[] = [];
  if (first.matricula) parts.push(`MATRÍCULA: ${first.matricula}`);
  if (first.numeroEconomico) {
    parts.push(`NÚMERO ECONÓMICO: ${first.numeroEconomico}`);
  }
  if (first.cliente) parts.push(`CLIENTE: ${first.cliente}`);

  return parts.length ? parts.join(' · ') : fallback;
}

export function executeT03FromSearch(args: {
  prestartToken: string;
  prestartSecret: string;
  idempotencySecret: string;
  identifierType: 'MATRICULA' | 'NUMERO_ECONOMICO';
  identifierValue: string;
  weightType: 'BRUTO' | 'TARA';
  currentWeightKg: number;
  rawSearchResponse: unknown;
  nowMs?: number;
}): ExecuteT03Success | ExecuteT03Blocked {
  if (!args.prestartToken.trim()) {
    return { ok: false, code: 'PRESTART_REQUIRED' };
  }

  const context: T03PrestartContext = {
    identifierType: args.identifierType,
    identifierValue: args.identifierValue,
    weightType: args.weightType,
    currentWeightKg: args.currentWeightKg,
  };

  let verified;
  try {
    verified = verifyPrestartToken({
      token: args.prestartToken,
      secret: args.prestartSecret,
      expectedContext: context,
      nowMs: args.nowMs,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === 'PRESTART_EXPIRED') {
      return { ok: false, code: 'PRESTART_EXPIRED' };
    }
    if (code === 'PRESTART_CONTEXT_MISMATCH') {
      return { ok: false, code: 'PRESTART_CONTEXT_MISMATCH' };
    }
    return { ok: false, code: 'PRESTART_INVALID' };
  }

  const search = parseT03SearchResponse(args.rawSearchResponse);
  const history = toT03History(search, {
    identifierType: args.identifierType,
    identifierValue: args.identifierValue,
  });

  const result = computeT03({
    weightType: args.weightType,
    currentWeightKg: args.currentWeightKg,
    history,
  });

  if (!result.ok) {
    return { ok: false, code: result.code };
  }

  const ids = deriveT03EventIdentity({
    secret: args.idempotencySecret,
    prestartJti: verified.claims.jti,
    taskContextDigest: verified.claims.taskContextDigest,
  });

  return {
    ok: true,
    consulta_id: ids.consultaId,
    event_id: ids.eventId,
    idempotency_key: ids.idempotencyKey,
    unit: {
      identifier_type: args.identifierType,
      identifier_value: args.identifierValue,
    },
    identity: {
      matricula: history[0]?.matricula ?? null,
      numero_economico: history[0]?.numeroEconomico ?? null,
      cliente: history[0]?.cliente ?? null,
    },
    analysis: {
      weight_type: args.weightType,
      current_weight_kg: args.currentWeightKg,
      historical_average_internal: result.averageInternal,
      historical_average_display_kg: result.averageDisplayKg,
      difference_kg: result.differenceKg,
      variation_percent_internal: result.variationPercentInternal,
      variation_percent_display: result.variationPercentDisplay,
      threshold_percent: 1.5,
      status: result.status,
      decision: result.decision,
    },
    data: {
      data_status: 'VIGENTE',
      data_as_of: search.metadata.source_updated_at,
      fallback_used: search.metadata.fallback_used,
      fallback_reason: search.metadata.fallback_reason,
      source_class: search.metadata.source_class,
      policy_version: search.metadata.policy_version,
    },
    com_policy: {
      operational_event_required: true,
      out_of_range_escalation_required:
        result.status === 'FUERA_DE_RANGO',
      authorization_basis:
        result.status === 'FUERA_DE_RANGO'
          ? ['T03_OPERATIONAL_AUTO', 'T03_OUT_OF_RANGE_AUTO']
          : ['T03_OPERATIONAL_AUTO'],
    },
    canonical_markdown: renderCanonicalT03({
      identifier: args.identifierValue,
      identityLine: identityLine(history, args.identifierValue),
      result,
    }),
    valid_count: result.validHistory.length,
    excluded_count: result.excludedHistory.length,
  };
}
