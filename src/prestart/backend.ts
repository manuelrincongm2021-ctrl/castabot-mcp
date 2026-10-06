import * as z from 'zod/v4';
import type { T03PrestartContext } from './token.js';
import { issuePrestartToken } from './token.js';

const BackendPrestartSchema = z.object({
  ok: z.literal(true),
  task: z.literal('T03'),
  mode: z.literal('OPERATIVO'),
  context: z.object({
    identifier_type: z.enum(['MATRICULA', 'NUMERO_ECONOMICO']),
    identifier_value: z.string().min(1),
    weight_type: z.enum(['BRUTO', 'TARA']),
    current_weight_kg: z.number().finite().positive(),
  }),
  checks: z.array(
    z.object({
      name: z.string().min(1),
      passed: z.literal(true),
    }),
  ).min(4),
  norm: z.object({
    digest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    updated_at: z.string().nullable(),
  }),
  data_route: z.object({
    dataset: z.literal('REPORTES_BASCULA'),
    source_class: z.literal('PRIMARY'),
    updated_at: z.string().nullable(),
    sheet_count: z.number().int().positive(),
  }),
  contract_version: z.literal('prestart-backend-v1'),
  verified_at: z.string().min(1),
});

export type BackendPrestartVerification = z.infer<typeof BackendPrestartSchema>;

export function parseBackendPrestartVerification(
  raw: unknown,
): BackendPrestartVerification {
  const parsed = BackendPrestartSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `PRESTART_BACKEND_RESPONSE_INVALID: ${parsed.error.message}`,
    );
  }

  const required = new Set([
    'NORM_CURRENT',
    'RULE_T03_RESOLVED',
    'DATA_ROUTE_RESOLVED',
    'INPUT_COMPLETE',
  ]);

  for (const check of parsed.data.checks) {
    required.delete(check.name);
  }

  if (required.size) {
    throw new Error(
      `PRESTART_BACKEND_CHECKS_INCOMPLETE: ${[...required].join(',')}`,
    );
  }

  return parsed.data;
}

function sameContext(
  verified: BackendPrestartVerification['context'],
  requested: T03PrestartContext,
): boolean {
  return (
    verified.identifier_type === requested.identifierType &&
    verified.identifier_value.trim().toUpperCase() ===
      requested.identifierValue.trim().toUpperCase() &&
    verified.weight_type === requested.weightType &&
    verified.current_weight_kg === requested.currentWeightKg
  );
}

export function issueT03PrestartFromBackend(args: {
  rawVerification: unknown;
  tokenSecret: string;
  requestedContext: T03PrestartContext;
  ttlSeconds?: number;
  nowMs?: number;
  jti?: string;
}) {
  const verification = parseBackendPrestartVerification(args.rawVerification);

  if (!sameContext(verification.context, args.requestedContext)) {
    throw new Error('PRESTART_BACKEND_CONTEXT_MISMATCH');
  }

  return issuePrestartToken({
    secret: args.tokenSecret,
    context: args.requestedContext,
    normRevisionTag: verification.norm.digest_sha256,
    dataRouteClass: verification.data_route.source_class,
    ttlSeconds: args.ttlSeconds,
    nowMs: args.nowMs,
    jti: args.jti,
  });
}
