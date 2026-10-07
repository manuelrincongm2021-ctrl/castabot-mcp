import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runT03Prestart } from '../src/prestart/service.js';
import { fetchT03SearchWithFallback } from '../src/t03/backend.js';
import { executeT03FromSearch } from '../src/t03/execute.js';
import { deliverT03Com } from '../src/t03/com.js';
import { registerT03Result } from '../src/t03/register.js';

const normText = [
  '66.C BLOQUE MAESTRO DE EJECUCIÓN PERSISTENTE DEL PROYECTO CASTABOT',
  'CONTROL PRE-RESPUESTA OBLIGATORIO EN TODO CHAT NUEVO',
  'REGLA PARA EL INFORME DE PESOS PROMEDIO',
  'ABS(VARIACIÓN %) ≤ 1.50 %',
  'ABS(VARIACIÓN %) > 1.50 %',
  'COM AUTOMÁTICO T03',
].join('\n');

const normDigest = createHash('sha256')
  .update(normText, 'utf8')
  .digest('hex');

const context = {
  identifierType: 'NUMERO_ECONOMICO' as const,
  identifierValue: 'C68 T68',
  weightType: 'TARA' as const,
  currentWeightKg: 18990,
};

const searchPayload = {
  ok: true,
  dataset: 'REPORTES_BASCULA',
  identifier_type: 'NUMERO_ECONOMICO',
  identifier_value: 'C68 T68',
  records: [
    { source_sheet: 'PROGRAMA', source_row: 1, folio: '1', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'A', producto: 'GAS LP', peso_bruto_kg: 36000, fecha_entrada: '01/01/2026', hora_entrada: '10:00:00', peso_tara_kg: 19000, fecha_salida: '01/01/2026', hora_salida: '11:00:00' },
    { source_sheet: 'PROGRAMA', source_row: 2, folio: '2', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'A', producto: 'GAS LP', peso_bruto_kg: 36100, fecha_entrada: '02/01/2026', hora_entrada: '10:00:00', peso_tara_kg: 19000, fecha_salida: '02/01/2026', hora_salida: '11:00:00' },
    { source_sheet: 'PROGRAMA', source_row: 3, folio: '3', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'A', producto: 'GAS LP', peso_bruto_kg: 36200, fecha_entrada: '03/01/2026', hora_entrada: '10:00:00', peso_tara_kg: 19000, fecha_salida: '03/01/2026', hora_salida: '11:00:00' },
  ],
  metadata: {
    source_class: 'PRIMARY',
    source_updated_at: '2026-10-02T12:38:42.089Z',
    read_at: '2026-10-07T02:30:00.000Z',
    fallback_used: false,
    fallback_reason: null,
    policy_version: 't03-source-v1',
    sheets_scanned: 7,
    sheets_skipped: [],
  },
};

test('E1 scripted flow preserves prestart -> source -> calculation -> COM -> postregister order', async () => {
  const order: string[] = [];

  const normFetch: typeof fetch = async () => {
    order.push('norm');
    return new Response(
      JSON.stringify({
        ok: true,
        source: 'CASTABOT_NORM',
        text: normText,
        digest_sha256: normDigest,
        updated_at: '2026-10-06T12:00:00.000Z',
        read_at: '2026-10-07T02:30:00.000Z',
      }),
      { status: 200 },
    );
  };

  const prestart = await runT03Prestart({
    backendUrl: 'https://example.test/exec',
    backendSecret: 'backend-secret',
    tokenSecret: 'prestart-secret',
    context,
    fetchImpl: normFetch,
    dataRouteProbe: async () => {
      order.push('route');
      return 'PRIMARY';
    },
    nowMs: 1_000_000,
    ttlSeconds: 600,
    jti: 'e2e-jti',
  });

  const searchFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.accion, 'BUSCAR_T03_CASTABOT');
    order.push('search');
    return new Response(JSON.stringify(searchPayload), { status: 200 });
  };

  const search = await fetchT03SearchWithFallback({
    url: 'https://example.test/exec',
    secret: 'backend-secret',
    input: {
      identifierType: context.identifierType,
      identifierValue: context.identifierValue,
    },
    fetchImpl: searchFetch,
  });

  const execution = executeT03FromSearch({
    prestartToken: prestart.prestart_token,
    prestartSecret: 'prestart-secret',
    idempotencySecret: 'idempotency-secret',
    ...context,
    rawSearchResponse: search,
    nowMs: 1_100_000,
  });

  assert.equal(execution.ok, true);
  if (!execution.ok) throw new Error(execution.code);

  const delivery = await deliverT03Com({
    result: execution,
    producer: async () => {
      order.push('com');
      return {
        ok: true,
        status: 'ENVIADO',
        telegram_message_id: 123,
      };
    },
  });

  assert.equal(delivery.accredited, true);

  const registerFetch: typeof fetch = async () => {
    order.push('register');
    return new Response(
      JSON.stringify({
        ok: true,
        registrado: true,
        duplicado: false,
        registro_id: execution.event_id,
        consulta_id: execution.consulta_id,
        fila: 10,
        control_relectura: 'SI',
        panel_actualizado: true,
      }),
      { status: 200 },
    );
  };

  const registered = await registerT03Result({
    url: 'https://example.test/exec',
    secret: 'backend-secret',
    result: execution,
    fetchImpl: registerFetch,
  });

  assert.equal(registered.control_relectura, 'SI');
  assert.deepEqual(order, ['norm', 'route', 'search', 'com', 'register']);
  assert.ok(execution.canonical_markdown.endsWith('**🟢 APROBADO PARA PESAR.**'));
});

test('E2 skip-gate attempt cannot calculate or produce COM identity', () => {
  const execution = executeT03FromSearch({
    prestartToken: '',
    prestartSecret: 'prestart-secret',
    idempotencySecret: 'idempotency-secret',
    ...context,
    rawSearchResponse: searchPayload,
  });

  assert.deepEqual(execution, {
    ok: false,
    code: 'PRESTART_REQUIRED',
  });
});
