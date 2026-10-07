import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNormSnapshot } from '../src/prestart/source.js';

test('reads and validates norm snapshot from trusted backend', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.accion, 'LEER_NORMA_CASTABOT');

    return new Response(
      JSON.stringify({
        ok: true,
        source: 'CASTABOT_NORM',
        text: '66.C',
        digest_sha256: 'a'.repeat(64),
        updated_at: '2026-10-06T12:00:00.000Z',
        read_at: '2026-10-07T01:00:00.000Z',
      }),
      { status: 200 },
    );
  };

  const result = await fetchNormSnapshot({
    url: 'https://example.test/exec',
    secret: 'secret',
    fetchImpl,
  });

  assert.equal(result.source, 'CASTABOT_NORM');
  assert.equal(result.digest_sha256, 'a'.repeat(64));
});

test('rejects invalid norm snapshot structure', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, source: 'CASTABOT_NORM' }), {
      status: 200,
    });

  await assert.rejects(
    () =>
      fetchNormSnapshot({
        url: 'https://example.test/exec',
        secret: 'secret',
        fetchImpl,
      }),
    /NORM_BACKEND_RESPONSE_INVALID/,
  );
});
