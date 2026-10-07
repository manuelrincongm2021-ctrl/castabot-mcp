import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchT03Search, fetchT03SearchWithFallback } from '../src/t03/backend.js';

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


test('uses authorized fallback when primary has no history', async () => {
  const actions: string[] = [];

  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    actions.push(body.accion);

    if (body.accion === 'BUSCAR_T03_CASTABOT') {
      return new Response(JSON.stringify(okPayload), { status: 200 });
    }

    return new Response(
      JSON.stringify({
        ...okPayload,
        records: [
          {
            source_sheet: 'SOFTWARE BASCULA',
            source_row: 10,
            folio: '1',
            cliente: 'CLIENTE',
            matricula: '72AM9P',
            numero_economico: 'X1',
            operador: 'OPERADOR',
            producto: 'PRODUCTO',
            peso_bruto_kg: 30000,
            fecha_entrada: '01/01/2026',
            hora_entrada: '10:00:00',
            peso_tara_kg: 18620,
            fecha_salida: '01/01/2026',
            hora_salida: '11:00:00',
          },
        ],
        metadata: {
          ...okPayload.metadata,
          source_class: 'AUTHORIZED_FALLBACK',
          fallback_used: true,
          fallback_reason: 'PRIMARY_NO_HISTORY',
          policy_version: 't03-fallback-v1',
          sheets_scanned: 1,
        },
      }),
      { status: 200 },
    );
  };

  const result = await fetchT03SearchWithFallback({
    url: 'https://example.test/exec',
    secret: 'secret',
    input: {
      identifierType: 'MATRICULA',
      identifierValue: '72AM9P',
    },
    fetchImpl,
  });

  assert.deepEqual(actions, [
    'BUSCAR_T03_CASTABOT',
    'BUSCAR_T03_FALLBACK_CASTABOT',
  ]);
  assert.equal(result.metadata.source_class, 'AUTHORIZED_FALLBACK');
  assert.equal(result.metadata.fallback_used, true);
});

test('fails closed when both T03 source routes are unavailable', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: 'UNAVAILABLE' }), {
      status: 200,
    });

  await assert.rejects(
    () =>
      fetchT03SearchWithFallback({
        url: 'https://example.test/exec',
        secret: 'secret',
        input: {
          identifierType: 'MATRICULA',
          identifierValue: '72AM9P',
        },
        fetchImpl,
      }),
    /T03_DATA_UNAVAILABLE/,
  );
});
