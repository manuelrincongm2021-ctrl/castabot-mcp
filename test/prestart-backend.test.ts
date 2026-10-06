import test from 'node:test';
import assert from 'node:assert/strict';
import {
  issueT03PrestartFromBackend,
  parseBackendPrestartVerification,
} from '../src/prestart/backend.js';
import { verifyPrestartToken } from '../src/prestart/token.js';

const verification = {
  ok: true,
  task: 'T03',
  mode: 'OPERATIVO',
  context: {
    identifier_type: 'NUMERO_ECONOMICO',
    identifier_value: 'C68',
    weight_type: 'TARA',
    current_weight_kg: 18990,
  },
  checks: [
    { name: 'NORM_CURRENT', passed: true },
    { name: 'RULE_T03_RESOLVED', passed: true },
    { name: 'DATA_ROUTE_RESOLVED', passed: true },
    { name: 'INPUT_COMPLETE', passed: true },
  ],
  norm: {
    digest_sha256: 'a'.repeat(64),
    updated_at: '2026-10-02T07:26:05.906Z',
  },
  data_route: {
    dataset: 'REPORTES_BASCULA',
    source_class: 'PRIMARY',
    updated_at: '2026-10-02T12:38:42.089Z',
    sheet_count: 7,
  },
  contract_version: 'prestart-backend-v1',
  verified_at: '2026-10-06T23:00:00.000Z',
};

test('accepts complete backend verification', () => {
  const parsed = parseBackendPrestartVerification(verification);
  assert.equal(parsed.data_route.dataset, 'REPORTES_BASCULA');
});

test('rejects verification missing mandatory check', () => {
  const incomplete = {
    ...verification,
    checks: verification.checks.filter(
      (check) => check.name !== 'NORM_CURRENT',
    ),
  };

  assert.throws(
    () => parseBackendPrestartVerification(incomplete),
    /PRESTART_BACKEND_CHECKS_INCOMPLETE/,
  );
});

test('issues token only for the context verified by backend', () => {
  const context = {
    identifierType: 'NUMERO_ECONOMICO' as const,
    identifierValue: 'C68',
    weightType: 'TARA' as const,
    currentWeightKg: 18990,
  };

  const issued = issueT03PrestartFromBackend({
    rawVerification: verification,
    tokenSecret: 'secret',
    requestedContext: context,
    nowMs: 1_000_000,
    ttlSeconds: 600,
    jti: 'backend-verified',
  });

  const checked = verifyPrestartToken({
    token: issued.token,
    secret: 'secret',
    expectedContext: context,
    nowMs: 1_100_000,
  });

  assert.equal(checked.claims.jti, 'backend-verified');
  assert.equal(checked.claims.normRevisionTag, 'a'.repeat(64));
});

test('does not sign a context different from backend verification', () => {
  assert.throws(
    () =>
      issueT03PrestartFromBackend({
        rawVerification: verification,
        tokenSecret: 'secret',
        requestedContext: {
          identifierType: 'NUMERO_ECONOMICO',
          identifierValue: 'C68',
          weightType: 'TARA',
          currentWeightKg: 19000,
        },
      }),
    /PRESTART_BACKEND_CONTEXT_MISMATCH/,
  );
});
