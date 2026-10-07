import test from 'node:test';
import assert from 'node:assert/strict';
import {
  digestT03Context,
  issuePrestartToken,
  verifyPrestartToken,
} from '../src/prestart/token.js';

const secret = 'test-prestart-secret';

const context = {
  identifierType: 'NUMERO_ECONOMICO' as const,
  identifierValue: ' c68 ',
  weightType: 'BRUTO' as const,
  currentWeightKg: 40000,
};

test('context digest normalizes identifier', () => {
  assert.equal(
    digestT03Context(context),
    digestT03Context({ ...context, identifierValue: 'C68' }),
  );
});

test('issues and verifies opaque token', () => {
  const issued = issuePrestartToken({
    secret,
    context,
    normRevisionTag: 'rev-test',
    dataRouteClass: 'PRIMARY',
    nowMs: 1_000_000,
    ttlSeconds: 600,
    jti: 'fixed-jti',
  });

  assert.ok(issued.token.startsWith('pst1.'));
  assert.ok(!issued.token.includes('C68'));

  const verified = verifyPrestartToken({
    token: issued.token,
    secret,
    expectedContext: context,
    nowMs: 1_100_000,
  });

  assert.equal(verified.claims.jti, 'fixed-jti');
});

test('rejects altered context', () => {
  const issued = issuePrestartToken({
    secret,
    context,
    normRevisionTag: 'rev-test',
    dataRouteClass: 'PRIMARY',
    nowMs: 1_000_000,
    ttlSeconds: 600,
  });

  assert.throws(
    () =>
      verifyPrestartToken({
        token: issued.token,
        secret,
        expectedContext: { ...context, currentWeightKg: 40001 },
        nowMs: 1_100_000,
      }),
    /PRESTART_CONTEXT_MISMATCH/,
  );
});

test('rejects expired token', () => {
  const issued = issuePrestartToken({
    secret,
    context,
    normRevisionTag: 'rev-test',
    dataRouteClass: 'PRIMARY',
    nowMs: 1_000_000,
    ttlSeconds: 10,
  });

  assert.throws(
    () =>
      verifyPrestartToken({
        token: issued.token,
        secret,
        expectedContext: context,
        nowMs: 1_020_000,
      }),
    /PRESTART_EXPIRED/,
  );
});

test('rejects tampering', () => {
  const issued = issuePrestartToken({
    secret,
    context,
    normRevisionTag: 'rev-test',
    dataRouteClass: 'PRIMARY',
  });

  const tampered = issued.token.slice(0, -1) + (issued.token.endsWith('A') ? 'B' : 'A');

  assert.throws(
    () =>
      verifyPrestartToken({
        token: tampered,
        secret,
        expectedContext: context,
      }),
    /PRESTART_INVALID/,
  );
});
