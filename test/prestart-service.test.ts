import test from 'node:test';
import assert from 'node:assert/strict';
import { runT03Prestart } from '../src/prestart/service.js';
import { verifyPrestartToken } from '../src/prestart/token.js';

const normText = [
  '66.C BLOQUE MAESTRO DE EJECUCIÓN PERSISTENTE DEL PROYECTO CASTABOT',
  'CONTROL PRE-RESPUESTA OBLIGATORIO EN TODO CHAT NUEVO',
  'REGLA PARA EL INFORME DE PESOS PROMEDIO',
  'ABS(VARIACIÓN %) ≤ 1.50 %',
  'ABS(VARIACIÓN %) > 1.50 %',
  'COM AUTOMÁTICO T03',
].join('\n');

const context = {
  identifierType: 'NUMERO_ECONOMICO' as const,
  identifierValue: 'C68 T68',
  weightType: 'TARA' as const,
  currentWeightKg: 18990,
};

test('issues prestart token only after norm and data route checks', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        source: 'CASTABOT_NORM',
        text: normText,
        digest_sha256: 'b'.repeat(64),
        updated_at: '2026-10-06T12:00:00.000Z',
        read_at: '2026-10-07T01:00:00.000Z',
      }),
      { status: 200 },
    );

  let routeChecked = false;

  const result = await runT03Prestart({
    backendUrl: 'https://example.test/exec',
    backendSecret: 'backend-secret',
    tokenSecret: 'token-secret',
    context,
    nowMs: 1_000_000,
    ttlSeconds: 600,
    jti: 'jti-prestart',
    fetchImpl,
    dataRouteProbe: async () => {
      routeChecked = true;
      return true;
    },
  });

  assert.equal(routeChecked, true);
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 4);

  const verified = verifyPrestartToken({
    token: result.prestart_token,
    secret: 'token-secret',
    expectedContext: context,
    nowMs: 1_100_000,
  });

  assert.equal(verified.claims.normRevisionTag, 'b'.repeat(64));
});

test('does not issue token when data route is unavailable', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        source: 'CASTABOT_NORM',
        text: normText,
        digest_sha256: 'b'.repeat(64),
        updated_at: null,
        read_at: '2026-10-07T01:00:00.000Z',
      }),
      { status: 200 },
    );

  await assert.rejects(
    () =>
      runT03Prestart({
        backendUrl: 'https://example.test/exec',
        backendSecret: 'backend-secret',
        tokenSecret: 'token-secret',
        context,
        fetchImpl,
        dataRouteProbe: async () => false,
      }),
    /PRESTART_DATA_ROUTE_UNAVAILABLE/,
  );
});
