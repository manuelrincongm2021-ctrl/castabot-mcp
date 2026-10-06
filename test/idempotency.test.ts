import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveT03EventIdentity } from '../src/com/idempotency.js';

test('same consultation produces same IDs', () => {
  const a = deriveT03EventIdentity({
    secret: 'secret',
    prestartJti: 'jti-1',
    taskContextDigest: 'ctx-1',
  });
  const b = deriveT03EventIdentity({
    secret: 'secret',
    prestartJti: 'jti-1',
    taskContextDigest: 'ctx-1',
  });

  assert.deepEqual(a, b);
});

test('new prestart token produces new consultation identity', () => {
  const a = deriveT03EventIdentity({
    secret: 'secret',
    prestartJti: 'jti-1',
    taskContextDigest: 'ctx-1',
  });
  const b = deriveT03EventIdentity({
    secret: 'secret',
    prestartJti: 'jti-2',
    taskContextDigest: 'ctx-1',
  });

  assert.notEqual(a.eventId, b.eventId);
});
