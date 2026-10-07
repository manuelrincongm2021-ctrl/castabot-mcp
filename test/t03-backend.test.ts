import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchT03Search } from '../src/t03/backend.js';

const okPayload = {
  ok: true,
  dataset: 'REPORTES_BASCULA',
  identifier_type: 'NUMERO_ECONOMICO',
  identifier_value: 'C68 T68',
  records: [],
  metadata: {
    source_class: 'PRIMARY',
    source_updated_at: '2026-10-02T12:38:42.089Z',
    read_at: '2026-10-07T01:20:15.906Z',
    fallback_used: false,
    fallback_reason: null,
    policy_version: 't03-source-v1',
    sheets_scanned: 7,
    sheets_skipped: [],
  },
};

test('posts BUSCAR_T03_CASTABOT and validates response', async () => {
  let body: any = null;

  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify(okPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await fetchT03Search({
    url: 'https://example.test/exec',
    secret: 'secret',
    input: {
      identifierType: 'NUMERO_ECONOMICO',
      identifierValue: 'C68 T68',
    },
    fetchImpl,
  });

  assert.equal(body.accion, 'BUSCAR_T03_CASTABOT');
  assert.equal(body.identifier_value, 'C68 T68');
  assert.equal(result.metadata.source_class, 'PRIMARY');
});

test('rejects backend ok=false', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: 'NOPE' }), {
      status: 200,
    });

  await assert.rejects(
    () =>
      fetchT03Search({
        url: 'https://example.test/exec',
        secret: 'secret',
        input: {
          identifierType: 'MATRICULA',
          identifierValue: 'ABC123',
        },
        fetchImpl,
      }),
    /NOPE/,
  );
});
