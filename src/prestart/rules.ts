export function normalizeNormText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const REQUIRED_T03_MARKERS = [
  '66.C BLOQUE MAESTRO DE EJECUCION PERSISTENTE DEL PROYECTO CASTABOT',
  'CONTROL PRE-RESPUESTA OBLIGATORIO EN TODO CHAT NUEVO',
  'REGLA PARA EL INFORME DE PESOS PROMEDIO',
  'ABS(VARIACION %) <= 1.50 %',
  'ABS(VARIACION %) > 1.50 %',
  'COM AUTOMATICO T03',
] as const;

export function verifyT03NormText(text: string):
  | { ok: true; markers: string[] }
  | { ok: false; missing: string[] } {
  const normalized = normalizeNormText(text);
  const missing = REQUIRED_T03_MARKERS.filter(
    (marker) => !normalized.includes(normalizeNormText(marker)),
  );

  if (missing.length) {
    return { ok: false, missing: [...missing] };
  }

  return { ok: true, markers: [...REQUIRED_T03_MARKERS] };
}
