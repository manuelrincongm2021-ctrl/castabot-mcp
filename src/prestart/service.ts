import { createHash } from 'node:crypto';
import { fetchNormSnapshot } from './source.js';
import { verifyT03NormText } from './rules.js';
import { issuePrestartToken, type T03PrestartContext } from './token.js';

export async function runT03Prestart(args: {
  backendUrl: string;
  backendSecret: string;
  tokenSecret: string;
  context: T03PrestartContext;
  dataRouteProbe: () => Promise<'PRIMARY' | 'AUTHORIZED_FALLBACK' | null>;
  ttlSeconds?: number;
  nowMs?: number;
  jti?: string;
  fetchImpl?: typeof fetch;
}) {
  const snapshot = await fetchNormSnapshot({
    url: args.backendUrl,
    secret: args.backendSecret,
    fetchImpl: args.fetchImpl,
  });

  const computedDigest = createHash('sha256')
    .update(snapshot.text, 'utf8')
    .digest('hex');

  if (computedDigest !== snapshot.digest_sha256) {
    throw new Error('PRESTART_NORM_DIGEST_MISMATCH');
  }

  const ruleCheck = verifyT03NormText(snapshot.text);
  if (!ruleCheck.ok) {
    throw new Error(
      `PRESTART_NORM_RULESET_INCOMPLETE: ${ruleCheck.missing.join(' | ')}`,
    );
  }

  const dataRouteClass = await args.dataRouteProbe();
  if (!dataRouteClass) {
    throw new Error('PRESTART_DATA_ROUTE_UNAVAILABLE');
  }

  const issued = issuePrestartToken({
    secret: args.tokenSecret,
    context: args.context,
    normRevisionTag: snapshot.digest_sha256,
    dataRouteClass,
    ttlSeconds: args.ttlSeconds,
    nowMs: args.nowMs,
    jti: args.jti,
  });

  return {
    ok: true as const,
    prestart_token: issued.token,
    expires_at: new Date(issued.claims.expiresAt * 1000).toISOString(),
    scope: {
      mode: 'OPERATIVO' as const,
      task: 'T03' as const,
    },
    checks: [
      { name: 'NORM_CURRENT', passed: true as const },
      { name: 'RULE_T03_RESOLVED', passed: true as const },
      { name: 'DATA_ROUTE_RESOLVED', passed: true as const },
      { name: 'INPUT_COMPLETE', passed: true as const },
    ],
    data_status: dataRouteClass === 'PRIMARY' ? 'VIGENTE' as const : 'DEGRADADO' as const,
    contract_version: 'prestart-v1' as const,
  };
}
