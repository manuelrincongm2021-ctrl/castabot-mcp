import test from 'node:test';
import assert from 'node:assert/strict';
import { issuePrestartToken } from '../src/prestart/token.js';
import { executeT03FromSearch } from '../src/t03/execute.js';

const prestartSecret = 'prestart-secret';
const idempotencySecret = 'idem-secret';

const context = {
  identifierType: 'NUMERO_ECONOMICO' as const,
  identifierValue: 'C68 T68',
  weightType: 'TARA' as const,
  currentWeightKg: 18990,
};

const search = {
  ok: true,
  dataset: 'REPORTES_BASCULA',
  identifier_type: 'NUMERO_ECONOMICO',
  identifier_value: 'C68 T68',
  records: [
    { source_sheet: 'PROGRAMA', source_row: 1074, folio: '12723', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'LUIS MONZON', producto: 'GAS LP', peso_bruto_kg: 36340, fecha_entrada: '30/04/2026', hora_entrada: '14:49:00', peso_tara_kg: 19060, fecha_salida: '30/04/2026', hora_salida: '20:08:00' },
    { source_sheet: 'PROGRAMA', source_row: 1293, folio: '12942', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'LUIS MONZON', producto: 'GAS LP', peso_bruto_kg: 36890, fecha_entrada: '07/05/2026', hora_entrada: '16:22:00', peso_tara_kg: 19110, fecha_salida: '08/05/2026', hora_salida: '3:19:00' },
    { source_sheet: 'PROGRAMA', source_row: 1463, folio: '13112', cliente: 'DAMIGAS', matricula: 'C508BJW', numero_economico: 'C68 T68', operador: 'CARLOS LEON', producto: 'GAS LP', peso_bruto_kg: 36520, fecha_entrada: '13/05/2026', hora_entrada: '12:42:00', peso_tara_kg: 18850, fecha_salida: '14/05/2026', hora_salida: '4:44:00' },
    { source_sheet: 'PROGRAMA', source_row: 1544, folio: '13193', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'CARLOS LEON', producto: 'GAS LP', peso_bruto_kg: 36640, fecha_entrada: '15/05/2026', hora_entrada: '13:38:00', peso_tara_kg: 19050, fecha_salida: '16/05/2026', hora_salida: '0:16:00' },
    { source_sheet: 'PROGRAMA', source_row: 2694, folio: '14343', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'LUIS MONZON', producto: 'GAS LP', peso_bruto_kg: 36680, fecha_entrada: '22/06/2026', hora_entrada: '14:36:00', peso_tara_kg: 18990, fecha_salida: '22/06/2026', hora_salida: '21:52:00' },
    { source_sheet: 'PROGRAMA', source_row: 3220, folio: '14869', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'LUIS MONZON', producto: 'GAS LP', peso_bruto_kg: 36720, fecha_entrada: '10/07/2026', hora_entrada: '13:31:00', peso_tara_kg: 19040, fecha_salida: '10/07/2026', hora_salida: '23:12:00' },
    { source_sheet: 'PROGRAMA', source_row: 3835, folio: '15484', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'BENJAMIN SANTOS', producto: 'GAS LP', peso_bruto_kg: 36190, fecha_entrada: '30/07/2026', hora_entrada: '13:25:00', peso_tara_kg: 18780, fecha_salida: '30/07/2026', hora_salida: '20:52:00' },
    { source_sheet: 'PROGRAMA', source_row: 4178, folio: '15827', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'BENJAMIN SANTOS', producto: 'GAS LP', peso_bruto_kg: 36610, fecha_entrada: '12/08/2026', hora_entrada: '14:02:00', peso_tara_kg: 18970, fecha_salida: '13/08/2026', hora_salida: '0:13:00' },
    { source_sheet: 'PROGRAMA', source_row: 4719, folio: '16368', cliente: 'DAMIGAS', matricula: 'C580BJW', numero_economico: 'C68 T68', operador: 'BENJAMIN SANTOS', producto: 'GAS LP', peso_bruto_kg: 36450, fecha_entrada: '03/09/2026', hora_entrada: '15:42:00', peso_tara_kg: 19050, fecha_salida: '03/09/2026', hora_salida: '20:23:00' },
  ],
  metadata: {
    source_class: 'PRIMARY',
    source_updated_at: '2026-10-02T12:38:42.089Z',
    read_at: '2026-10-07T01:20:15.906Z',
    fallback_used: false,
    fallback_reason: null,
    policy_version: 't03-source-v1',
    sheets_scanned: 7,
    sheets_skipped: [{ sheet: 'DAMIGAS', reason: 'IDENTIFIER_COLUMN_NOT_FOUND' }],
  },
};

function token() {
  return issuePrestartToken({
    secret: prestartSecret,
    context,
    normRevisionTag: 'live-test-revision',
    dataRouteClass: 'PRIMARY',
    nowMs: 1_000_000,
    ttlSeconds: 600,
    jti: 'c68-live-jti',
  }).token;
}

test('computes deterministic T03 from verified live fixture', () => {
  const result = executeT03FromSearch({
    prestartToken: token(),
    prestartSecret,
    idempotencySecret,
    ...context,
    rawSearchResponse: search,
    nowMs: 1_100_000,
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.code);

  assert.equal(result.valid_count, 9);
  assert.equal(result.analysis.historical_average_display_kg, 18989);
  assert.equal(result.analysis.variation_percent_display, '0.01');
  assert.equal(result.analysis.status, 'DENTRO_DE_RANGO');
  assert.ok(result.canonical_markdown.includes('| 12723 | 30/04/2026 |'));
  assert.ok(!result.canonical_markdown.includes('PESO NETO'));
  assert.ok(result.canonical_markdown.endsWith('**🟢 APROBADO PARA PESAR.**'));
});

test('rejects missing prestart token before calculation', () => {
  const result = executeT03FromSearch({
    prestartToken: '',
    prestartSecret,
    idempotencySecret,
    ...context,
    rawSearchResponse: search,
  });

  assert.deepEqual(result, { ok: false, code: 'PRESTART_REQUIRED' });
});

test('rejects token bound to a different current weight', () => {
  const result = executeT03FromSearch({
    prestartToken: token(),
    prestartSecret,
    idempotencySecret,
    ...context,
    currentWeightKg: 19000,
    rawSearchResponse: search,
    nowMs: 1_100_000,
  });

  assert.deepEqual(result, { ok: false, code: 'PRESTART_CONTEXT_MISMATCH' });
});


test('acceptance 72AM9P: authorized fallback excludes open zero tara', () => {
  const fallbackContext = {
    identifierType: 'MATRICULA' as const,
    identifierValue: '72AM9P',
    weightType: 'TARA' as const,
    currentWeightKg: 18620,
  };

  const issued = issuePrestartToken({
    secret: prestartSecret,
    context: fallbackContext,
    normRevisionTag: 'fallback-test-revision',
    dataRouteClass: 'AUTHORIZED_FALLBACK',
    nowMs: 1_000_000,
    ttlSeconds: 600,
    jti: '72am9p-jti',
  });

  const rawFallback = {
    ok: true,
    dataset: 'REPORTES_BASCULA',
    identifier_type: 'MATRICULA',
    identifier_value: '72AM9P',
    records: [
      { source_sheet: 'SOFTWARE BASCULA', source_row: 290, folio: '11939', cliente: 'PAVIMENTOS ASFALTICOS', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 46900, fecha_entrada: '09/04/2026', hora_entrada: '7:09:00', peso_tara_kg: 18720, fecha_salida: '09/04/2026', hora_salida: '10:48:00' },
      { source_sheet: 'SOFTWARE BASCULA', source_row: 509, folio: '12158', cliente: 'CONSTRUCTORA GRUPO TAP', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 51660, fecha_entrada: '15/04/2026', hora_entrada: '8:44:00', peso_tara_kg: 18770, fecha_salida: '15/04/2026', hora_salida: '11:51:00' },
      { source_sheet: 'SOFTWARE BASCULA', source_row: 1387, folio: '13036', cliente: 'PAVIMENTOS ASFALTICOS DEL SUR', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 50270, fecha_entrada: '11/05/2026', hora_entrada: '8:01:00', peso_tara_kg: 19240, fecha_salida: '11/05/2026', hora_salida: '12:27:00' },
      { source_sheet: 'SOFTWARE BASCULA', source_row: 1631, folio: '13280', cliente: 'PAVIMENTOS ASFALTICOS DEL SUR', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 49720, fecha_entrada: '19/05/2026', hora_entrada: '7:32:00', peso_tara_kg: 18730, fecha_salida: '19/05/2026', hora_salida: '13:27:00' },
      { source_sheet: 'SOFTWARE BASCULA', source_row: 2072, folio: '13721', cliente: 'GRUPO TAPACHULA', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 51330, fecha_entrada: '03/06/2026', hora_entrada: '7:23:00', peso_tara_kg: 18530, fecha_salida: '03/06/2026', hora_salida: '15:05:00' },
      { source_sheet: 'SOFTWARE BASCULA', source_row: 2467, folio: '14116', cliente: 'GRUPO TAPACHULA', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 51330, fecha_entrada: '15/06/2026', hora_entrada: '7:26:00', peso_tara_kg: 18610, fecha_salida: '15/06/2026', hora_salida: '13:29:00' },
      { source_sheet: 'SOFTWARE BASCULA', source_row: 5248, folio: '16896', cliente: 'GRUPO TAPACHULA', matricula: '72AM9P', numero_economico: 'S/P', operador: 'RICARDO GARCIA PALACIOS', producto: 'ASFALTO', peso_bruto_kg: 51560, fecha_entrada: '24/09/2026', hora_entrada: '12:18:00', peso_tara_kg: 0, fecha_salida: '00/01/1900', hora_salida: '0:00:00' },
    ],
    metadata: {
      source_class: 'AUTHORIZED_FALLBACK',
      source_updated_at: '2026-10-06T00:00:00.000Z',
      read_at: '2026-10-07T02:00:00.000Z',
      fallback_used: true,
      fallback_reason: 'PRIMARY_NO_HISTORY',
      policy_version: 't03-fallback-v1',
      sheets_scanned: 1,
      sheets_skipped: [],
    },
  };

  const result = executeT03FromSearch({
    prestartToken: issued.token,
    prestartSecret,
    idempotencySecret,
    ...fallbackContext,
    rawSearchResponse: rawFallback,
    nowMs: 1_100_000,
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.code);

  assert.equal(result.valid_count, 6);
  assert.equal(result.excluded_count, 1);
  assert.equal(result.analysis.historical_average_display_kg, 18767);
  assert.equal(result.analysis.variation_percent_display, '-0.78');
  assert.equal(result.analysis.status, 'DENTRO_DE_RANGO');
  assert.equal(result.data.source_class, 'AUTHORIZED_FALLBACK');
  assert.equal(result.data.fallback_used, true);
  assert.ok(result.canonical_markdown.endsWith('**🟢 APROBADO PARA PESAR.**'));
});
