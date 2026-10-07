import test from 'node:test';
import assert from 'node:assert/strict';
import { buildT03ComCaption, deliverT03Com } from '../src/t03/com.js';
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

test('builds compact COM payload with required T03 facts', () => {
  const caption = buildT03ComCaption(result);
  assert.ok(caption.includes('CONSULTA_ID: T03Q-abc'));
  assert.ok(caption.includes('REGISTROS COMPARABLES: 9'));
  assert.ok(caption.includes('DECISIÓN: APROBADO_PARA_PESAR'));
  assert.ok(caption.length < 4096);
});

test('accredits only ENVIADO with Telegram message id', async () => {
  const delivery = await deliverT03Com({
    result,
    producer: async () => ({
      ok: true,
      status: 'ENVIADO',
      telegram_message_id: 123,
    }),
  });

  assert.equal(delivery.accredited, true);
});

test('reprocesses and rereads same idempotent event once', async () => {
  let calls = 0;
  let processed = 0;

  const delivery = await deliverT03Com({
    result,
    producer: async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: true, status: 'PENDIENTE' };
      }
      return {
        ok: true,
        duplicado: true,
        status: 'ENVIADO',
        telegram_message_id: 456,
      };
    },
    processQueue: async () => {
      processed += 1;
    },
  });

  assert.equal(calls, 2);
  assert.equal(processed, 1);
  assert.equal(delivery.accredited, true);
});

test('does not claim delivery without terminal evidence', async () => {
  const delivery = await deliverT03Com({
    result,
    producer: async () => ({
      ok: true,
      status: 'PENDIENTE',
    }),
  });

  assert.equal(delivery.accredited, false);
});
