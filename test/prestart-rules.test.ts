import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNormText, verifyT03NormText } from '../src/prestart/rules.js';

const validText = [
  '66.C BLOQUE MAESTRO DE EJECUCIÓN PERSISTENTE DEL PROYECTO CASTABOT',
  'CONTROL PRE-RESPUESTA OBLIGATORIO EN TODO CHAT NUEVO',
  'REGLA PARA EL INFORME DE PESOS PROMEDIO',
  'ABS(VARIACIÓN %) ≤ 1.50 %',
  'ABS(VARIACIÓN %) > 1.50 %',
  'COM AUTOMÁTICO T03',
].join('\n');

test('normalizes accents and unicode comparator', () => {
  assert.equal(
    normalizeNormText('VARIACIÓN ≤ 1.50'),
    'VARIACION <= 1.50',
  );
});

test('accepts current T03 normative markers', () => {
  const result = verifyT03NormText(validText);
  assert.equal(result.ok, true);
});

test('fails closed when a mandatory marker is absent', () => {
  const result = verifyT03NormText(
    validText.replace('COM AUTOMÁTICO T03', ''),
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected missing marker');
  assert.ok(result.missing.includes('COM AUTOMATICO T03'));
});
