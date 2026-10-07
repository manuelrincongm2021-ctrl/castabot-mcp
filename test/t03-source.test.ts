import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIdentifier,
  parseT03SearchResponse,
  toT03History,
} from '../src/t03/source.js';

const raw = {
  ok: true,
  dataset: 'REPORTES_BASCULA',
  identifier_type: 'NUMERO_ECONOMICO',
  identifier_value: 'PG-1375 B',
  records: [
    {
      source_sheet: 'TRANSPORTES DAMIANO',
      source_row: 5,
      folio: '8153',
      cliente: 'TRANSPORTES DAMIANO',
      matricula: '27AY3Z',
      numero_economico: 'PG 1375 B',
      operador: 'JOSE LUIS ALVARADO',
      producto: 'GAS LP',
      peso_bruto_kg: 42350,
      fecha_entrada: '09/12/2025',
      hora_entrada: '14:30:00',
      peso_tara_kg: 22170,
      fecha_salida: '09/12/2025',
      hora_salida: '21:44:00',
    },
  ],
  metadata: {
    source_class: 'PRIMARY',
    source_updated_at: '2026-10-02T12:38:42.089Z',
    read_at: '2026-10-06T23:00:00.000Z',
    fallback_used: false,
    fallback_reason: null,
    policy_version: 't03-source-v1',
    sheets_scanned: 7,
    sheets_skipped: [],
  },
};

test('normalizes punctuation and spaces in unit identifiers', () => {
  assert.equal(normalizeIdentifier('PG-1375 B'), normalizeIdentifier('PG 1375 B'));
  assert.equal(normalizeIdentifier(' 27-ay3z '), '27AY3Z');
});

test('validates backend T03 source response', () => {
  const parsed = parseT03SearchResponse(raw);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.metadata.source_class, 'PRIMARY');
});

test('maps source records to deterministic history and verifies unit', () => {
  const parsed = parseT03SearchResponse(raw);
  const history = toT03History(parsed, {
    identifierType: 'NUMERO_ECONOMICO',
    identifierValue: 'PG-1375 B',
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].matchesUnit, true);
  assert.equal(history[0].pesoBrutoKg, 42350);
  assert.equal(history[0].pesoTaraKg, 22170);
});

test('does not silently accept a mismatched returned unit', () => {
  const parsed = parseT03SearchResponse(raw);
  const history = toT03History(parsed, {
    identifierType: 'NUMERO_ECONOMICO',
    identifierValue: 'PG-9999',
  });

  assert.equal(history[0].matchesUnit, false);
});
