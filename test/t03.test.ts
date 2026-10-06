import test from 'node:test';
import assert from 'node:assert/strict';
import { computeT03, renderCanonicalT03 } from '../src/t03/compute.js';

const baseHistory = [
  { folio: 1, pesoBrutoKg: 10000, pesoTaraKg: 5000 },
  { folio: 2, pesoBrutoKg: 10000, pesoTaraKg: 5000 },
  { folio: 3, pesoBrutoKg: 10000, pesoTaraKg: 5000 },
];

function success(currentWeightKg: number) {
  const result = computeT03({
    weightType: 'BRUTO',
    currentWeightKg,
    history: baseHistory,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.code);
  return result;
}

test('exactly +1.50% is inside range', () => {
  const result = success(10150);
  assert.equal(result.variationPercentDisplay, '1.50');
  assert.equal(result.status, 'DENTRO_DE_RANGO');
  assert.equal(result.decision, 'APROBADO_PARA_PESAR');
});

test('+1.51% is outside range', () => {
  const result = success(10151);
  assert.equal(result.variationPercentDisplay, '1.51');
  assert.equal(result.status, 'FUERA_DE_RANGO');
});

test('exactly -1.50% is inside range', () => {
  const result = success(9850);
  assert.equal(result.variationPercentDisplay, '-1.50');
  assert.equal(result.status, 'DENTRO_DE_RANGO');
});

test('-1.51% is outside range', () => {
  const result = success(9849);
  assert.equal(result.variationPercentDisplay, '-1.51');
  assert.equal(result.status, 'FUERA_DE_RANGO');
});

test('zero selected weight is excluded', () => {
  const result = computeT03({
    weightType: 'BRUTO',
    currentWeightKg: 10150,
    history: [
      { folio: 1, pesoBrutoKg: 10000 },
      { folio: 2, pesoBrutoKg: 0 },
      { folio: 3, pesoBrutoKg: 10000 },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.code);
  assert.equal(result.averageInternal, 10000);
  assert.equal(result.excludedHistory[0]?.reason, 'ZERO_WEIGHT');
});

test('review candidate blocks final calculation', () => {
  const result = computeT03({
    weightType: 'BRUTO',
    currentWeightKg: 10000,
    history: [
      { folio: 1, pesoBrutoKg: 10000 },
      { folio: 2, pesoBrutoKg: 17000, requiresReview: true, reviewReason: 'ANOMALY' },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HISTORY_REVIEW_REQUIRED');
});

test('no valid history does not invent average', () => {
  const result = computeT03({
    weightType: 'TARA',
    currentWeightKg: 5000,
    history: [{ folio: 1, pesoTaraKg: 0 }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_VALID_HISTORY');
});

test('canonical renderer keeps ten columns and semaphore last', () => {
  const result = success(10150);
  const markdown = renderCanonicalT03({
    identifier: 'C68',
    result,
  });

  const tableHeader = markdown
    .split('\n')
    .find((line) => line.startsWith('| FOLIO |'));

  assert.ok(tableHeader);
  assert.equal((tableHeader!.match(/\|/g) || []).length - 1, 10);
  assert.ok(!tableHeader!.includes('PESO NETO'));
  assert.ok(markdown.includes('**📊 PESO HISTÓRICO:** 10000 kg'));
  assert.ok(markdown.endsWith('**🟢 APROBADO PARA PESAR.**'));
});
