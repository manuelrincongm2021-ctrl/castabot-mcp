import test from 'node:test';
import assert from 'node:assert/strict';
import { registerT03Result } from '../src/t03/register.js';
import type { ExecuteT03Success } from '../src/t03/execute.js';

const result: ExecuteT03Success = {
  ok: true,
  consulta_id: 'T03Q-abc',
  event_id: 'T03-abc',
  idempotency_key: 'abc',
  unit: {
    identifier_type: 'NUMERO_ECONOMICO',
    identifier_value: 'C68 T68',
  },
  identity: {
    matricula: 'C580BJW',
    numero_economico: 'C68 T68',
    cliente: 'DAMIGAS',
  },
  analysis: {
    weight_type: 'TARA',
    current_weight_kg: 18990,
    historical_average_internal: 18988.88888888889,
    historical_average_display_kg: 18989,
    difference_kg: 1.1111111111094942,
    variation_percent_internal: 0.0058513750731336725,
    variation_percent_display: '0.01',
    threshold_percent: 1.5,
    status: 'DENTRO_DE_RANGO',
    decision: 'APROBADO_PARA_PESAR',
  },
  data: {
    data_status: 'VIGENTE',
    data_as_of: '2026-10-02T12:38:42.089Z',
    fallback_used: false,
    fallback_reason: null,
    source_class: 'PRIMARY',
    policy_version: 't03-source-v1',
  },
  com_policy: {
    operational_event_required: true,
    out_of_range_escalation_required: false,
    authorization_basis: ['T03_OPERATIONAL_AUTO'],
  },
  canonical_markdown: 'canonical',
  valid_count: 9,
  excluded_count: 0,
};

test('posts idempotent T03 postregister payload', async () => {
  let body: any = null;

  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body || '{}'));

    return new Response(
      JSON.stringify({
        ok: true,
        registrado: true,
        duplicado: false,
        registro_id: 'T03-abc',
        consulta_id: 'T03Q-abc',
        fila: 20,
        control_relectura: 'SI',
        panel_actualizado: true,
      }),
      { status: 200 },
    );
  };

  const response = await registerT03Result({
    url: 'https://example.test/exec',
    secret: 'secret',
    result,
    consultanteResponsable: 'OPERADOR PRUEBA',
    fetchImpl,
  });

  assert.equal(body.accion, 'REGISTRAR_T03_CASTABOT');
  assert.equal(body.registro.registro_id, 'T03-abc');
  assert.equal(body.registro.consulta_id, 'T03Q-abc');
  assert.equal(body.registro.numero_economico, 'C68 T68');
  assert.equal(body.registro.registros_comparables, 9);
  assert.equal(response.control_relectura, 'SI');
  assert.equal(response.panel_actualizado, true);
});

test('rejects incomplete postregister response', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 });

  await assert.rejects(
    () =>
      registerT03Result({
        url: 'https://example.test/exec',
        secret: 'secret',
        result,
        fetchImpl,
      }),
    /T03_REGISTER_BACKEND_RESPONSE_INVALID/,
  );
});
