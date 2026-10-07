import * as z from 'zod/v4';
import type { T03HistoryRecord } from './compute.js';

const NullableString = z.string().nullable().optional();
const NullableNumber = z.number().finite().nullable().optional();

const BackendRecordSchema = z.object({
  source_sheet: z.string().min(1),
  source_row: z.number().int().positive(),
  folio: z.union([z.string(), z.number()]).nullable().optional(),
  cliente: NullableString,
  matricula: NullableString,
  numero_economico: NullableString,
  operador: NullableString,
  producto: NullableString,
  peso_bruto_kg: NullableNumber,
  fecha_entrada: NullableString,
  hora_entrada: NullableString,
  peso_tara_kg: NullableNumber,
  fecha_salida: NullableString,
  hora_salida: NullableString,
});

const SearchMetadataSchema = z.object({
  source_class: z.enum(['PRIMARY', 'AUTHORIZED_FALLBACK']),
  source_updated_at: z.string().nullable(),
  read_at: z.string().min(1),
  fallback_used: z.boolean(),
  fallback_reason: z.string().nullable(),
  policy_version: z.string().min(1),
  sheets_scanned: z.number().int().nonnegative(),
  sheets_skipped: z.array(
    z.object({
      sheet: z.string(),
      reason: z.string(),
    }),
  ),
});

export const T03SearchResponseSchema = z.object({
  ok: z.literal(true),
  dataset: z.literal('REPORTES_BASCULA'),
  identifier_type: z.enum(['MATRICULA', 'NUMERO_ECONOMICO']),
  identifier_value: z.string().min(1),
  records: z.array(BackendRecordSchema),
  metadata: SearchMetadataSchema,
});

export type T03SearchResponse = z.infer<typeof T03SearchResponseSchema>;

export function normalizeIdentifier(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function parseT03SearchResponse(raw: unknown): T03SearchResponse {
  const parsed = T03SearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`T03_SOURCE_RESPONSE_INVALID: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function toT03History(
  response: T03SearchResponse,
  expected: {
    identifierType: 'MATRICULA' | 'NUMERO_ECONOMICO';
    identifierValue: string;
  },
): T03HistoryRecord[] {
  if (response.identifier_type !== expected.identifierType) {
    throw new Error('T03_SOURCE_IDENTIFIER_TYPE_MISMATCH');
  }

  const expectedNormalized = normalizeIdentifier(expected.identifierValue);
  if (!expectedNormalized) {
    throw new Error('T03_SOURCE_IDENTIFIER_INVALID');
  }

  return response.records.map((record) => {
    const actual =
      expected.identifierType === 'MATRICULA'
        ? record.matricula
        : record.numero_economico;

    const matchesUnit =
      typeof actual === 'string' &&
      normalizeIdentifier(actual) === expectedNormalized;

    return {
      folio: record.folio ?? null,
      fechaEntrada: record.fecha_entrada ?? null,
      matricula: record.matricula ?? null,
      numeroEconomico: record.numero_economico ?? null,
      cliente: record.cliente ?? null,
      operador: record.operador ?? null,
      pesoBrutoKg: record.peso_bruto_kg ?? null,
      pesoTaraKg: record.peso_tara_kg ?? null,
      matchesUnit,
    };
  });
}
