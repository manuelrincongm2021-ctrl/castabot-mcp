import { fetchNormSnapshot } from './source.js';
import { verifyT03NormText } from './rules.js';
import { issuePrestartToken, type T03PrestartContext } from './token.js';

export async function runT03Prestart(args: {
  backendUrl: string;
  backendSecret: string;
  tokenSecret: string;
  context: T03PrestartContext;
  dataRouteProbe: () => Promise<boolean>;
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

  const ruleCheck = verifyT03NormText(snapshot.text);
  if (!ruleCheck.ok) {
    throw new Error(
      `PRESTART_NORM_RULESET_INCOMPLETE: ${ruleCheck.missing.join(' | ')}`,
    );
  }

  const routeOk = await args.dataRouteProbe();
  if (!routeOk) {
    throw new Error('PRESTART_DATA_ROUTE_UNAVAILABLE');
  }

  const issued = issuePrestartToken({
    secret: args.tokenSecret,
    context: args.context,
    normRevisionTag: snapshot.digest_sha256,
    dataRouteClass: 'PRIMARY',
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
    data_status: 'VIGENTE' as const,
    contract_version: 'prestart-v1' as const,
  };
}
