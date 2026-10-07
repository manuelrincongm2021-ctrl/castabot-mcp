export type T03WeightType = 'BRUTO' | 'TARA';

export type T03HistoryRecord = {
  folio?: string | number | null;
  fechaEntrada?: string | null;
  matricula?: string | null;
  numeroEconomico?: string | null;
  cliente?: string | null;
  operador?: string | null;
  pesoBrutoKg?: number | null;
  pesoTaraKg?: number | null;
  matchesUnit?: boolean;
  comparable?: boolean;
  requiresReview?: boolean;
  reviewReason?: string;
};

export type T03Success = {
  ok: true;
  weightType: T03WeightType;
  currentWeightKg: number;
  validHistory: T03HistoryRecord[];
  excludedHistory: Array<{ record: T03HistoryRecord; reason: string }>;
  averageInternal: number;
  averageDisplayKg: number;
  differenceKg: number;
  variationPercentInternal: number;
  variationPercentDisplay: string;
  status: 'DENTRO_DE_RANGO' | 'FUERA_DE_RANGO';
  decision: 'APROBADO_PARA_PESAR' | 'CONSULTAR_ADMINISTRADOR';
  rowAverages: {
    bruto: number | null;
    tara: number | null;
  };
};

export type T03Blocked = {
  ok: false;
  code: 'NO_VALID_HISTORY' | 'HISTORY_REVIEW_REQUIRED' | 'INVALID_CURRENT_WEIGHT';
  validHistory: T03HistoryRecord[];
  excludedHistory: Array<{ record: T03HistoryRecord; reason: string }>;
  reviewRequired: T03HistoryRecord[];
};

export type T03Result = T03Success | T03Blocked;

const THRESHOLD_PERCENT = 1.5;

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function selectedWeight(record: T03HistoryRecord, type: T03WeightType): number | null {
  const value = type === 'BRUTO' ? record.pesoBrutoKg : record.pesoTaraKg;
  return finitePositive(value) ? value : null;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeT03(args: {
  weightType: T03WeightType;
  currentWeightKg: number;
  history: T03HistoryRecord[];
}): T03Result {
  const excludedHistory: Array<{ record: T03HistoryRecord; reason: string }> = [];
  const reviewRequired: T03HistoryRecord[] = [];

  if (!finitePositive(args.currentWeightKg)) {
    return {
      ok: false,
      code: 'INVALID_CURRENT_WEIGHT',
      validHistory: [],
      excludedHistory,
      reviewRequired,
    };
  }

  const validHistory: T03HistoryRecord[] = [];

  for (const record of args.history) {
    if (record.requiresReview) {
      reviewRequired.push(record);
      continue;
    }

    if (record.matchesUnit === false) {
      excludedHistory.push({ record, reason: 'UNIT_MISMATCH' });
      continue;
    }

    if (record.comparable === false) {
      excludedHistory.push({ record, reason: 'NOT_COMPARABLE' });
      continue;
    }

    const rawSelected =
      args.weightType === 'BRUTO' ? record.pesoBrutoKg : record.pesoTaraKg;

    if (rawSelected === 0) {
      excludedHistory.push({ record, reason: 'ZERO_WEIGHT' });
      continue;
    }

    if (!finitePositive(rawSelected)) {
      excludedHistory.push({ record, reason: 'MISSING_OR_INVALID_WEIGHT' });
      continue;
    }

    validHistory.push(record);
  }

  if (reviewRequired.length) {
    return {
      ok: false,
      code: 'HISTORY_REVIEW_REQUIRED',
      validHistory,
      excludedHistory,
      reviewRequired,
    };
  }

  const selectedValues = validHistory
    .map((record) => selectedWeight(record, args.weightType))
    .filter((value): value is number => value !== null);

  const averageInternal = avg(selectedValues);

  if (averageInternal === null) {
    return {
      ok: false,
      code: 'NO_VALID_HISTORY',
      validHistory,
      excludedHistory,
      reviewRequired,
    };
  }

  const differenceKg = args.currentWeightKg - averageInternal;
  const variationPercentInternal = (differenceKg / averageInternal) * 100;
  const outside = Math.abs(variationPercentInternal) > THRESHOLD_PERCENT;

  const brutoValues = validHistory
    .map((record) => record.pesoBrutoKg)
    .filter(finitePositive);
  const taraValues = validHistory
    .map((record) => record.pesoTaraKg)
    .filter(finitePositive);

  return {
    ok: true,
    weightType: args.weightType,
    currentWeightKg: args.currentWeightKg,
    validHistory,
    excludedHistory,
    averageInternal,
    averageDisplayKg: Math.round(averageInternal),
    differenceKg,
    variationPercentInternal,
    variationPercentDisplay: variationPercentInternal.toFixed(2),
    status: outside ? 'FUERA_DE_RANGO' : 'DENTRO_DE_RANGO',
    decision: outside ? 'CONSULTAR_ADMINISTRADOR' : 'APROBADO_PARA_PESAR',
    rowAverages: {
      bruto: avg(brutoValues),
      tara: avg(taraValues),
    },
  };
}

function cell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value).replaceAll('|', '\\|');
}

function formatKg(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, '');
}

function rowVariation(value: number | null | undefined, average: number | null): string {
  if (!finitePositive(value) || average === null) return '—';
  return (((value - average) / average) * 100).toFixed(2) + ' %';
}

function exclusionObservation(
  excluded: T03Success['excludedHistory'],
): string {
  if (!excluded.length) return '';

  const counts = new Map<string, number>();
  for (const item of excluded) {
    counts.set(item.reason, (counts.get(item.reason) || 0) + 1);
  }

  const labels: Record<string, string> = {
    ZERO_WEIGHT: 'con peso 0',
    MISSING_OR_INVALID_WEIGHT: 'sin peso válido',
    UNIT_MISMATCH: 'de otra unidad',
    NOT_COMPARABLE: 'marcado no comparable',
  };

  const parts = [...counts.entries()].map(([reason, count]) => {
    const noun = count === 1 ? 'registro' : 'registros';
    const label = labels[reason] || 'no comparable';
    return `${count} ${noun} ${label}`;
  });

  return ` Se excluyó ${parts.join(', ')} del promedio.`;
}

export function renderCanonicalT03(args: {
  identifier: string;
  identityLine?: string;
  result: T03Success;
}): string {
  const header =
    '| FOLIO | FECHA DE ENTRADA | MATRÍCULA | NÚMERO ECONÓMICO | CLIENTE | OPERADOR | PESO BRUTO | % VARIACIÓN PESO BRUTO VS PROMEDIO BRUTO | PESO TARA | % VARIACIÓN PESO TARA VS PROMEDIO TARA |';
  const separator =
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |';

  const rows = args.result.validHistory.map((record) => {
    const bruto = finitePositive(record.pesoBrutoKg) ? record.pesoBrutoKg : null;
    const tara = finitePositive(record.pesoTaraKg) ? record.pesoTaraKg : null;

    return [
      cell(record.folio),
      cell(record.fechaEntrada),
      cell(record.matricula),
      cell(record.numeroEconomico),
      cell(record.cliente),
      cell(record.operador),
      bruto === null ? '—' : formatKg(bruto),
      rowVariation(bruto, args.result.rowAverages.bruto),
      tara === null ? '—' : formatKg(tara),
      rowVariation(tara, args.result.rowAverages.tara),
    ].join(' | ');
  }).map((row) => `| ${row} |`);

  const direction =
    args.result.differenceKg > 0
      ? 'por arriba'
      : args.result.differenceKg < 0
        ? 'por debajo'
        : 'igual';

  const baseObservation =
    args.result.differenceKg === 0
      ? 'El peso actual coincide con el promedio histórico.'
      : `El peso actual está ${formatKg(Math.abs(args.result.differenceKg))} kg ${direction} del promedio histórico, con una variación de ${args.result.variationPercentDisplay} %.`;

  const observation =
    baseObservation + exclusionObservation(args.result.excludedHistory);

  const semaphore =
    args.result.status === 'DENTRO_DE_RANGO'
      ? '**🟢 APROBADO PARA PESAR.**'
      : '**🔴 CONSULTAR CON ADMINISTRADOR ANTES DE PESAR.**';

  return [
    `## INFORME DE PESO PROMEDIO — ${args.identifier}`,
    '',
    args.identityLine?.trim() || args.identifier,
    '',
    header,
    separator,
    ...rows,
    '',
    `**📊 PESO HISTÓRICO:** ${args.result.averageDisplayKg} kg`,
    `**⚖️ PESO ACTUAL:** ${formatKg(args.result.currentWeightKg)} kg`,
    `**↕️ DIFERENCIA:** ${formatKg(args.result.differenceKg)} kg`,
    `**📈 VARIACIÓN:** ${args.result.variationPercentDisplay} %`,
    '',
    observation,
    '',
    semaphore,
  ].join('\n');
}
