/**
 * CASTABOT — fallback autorizado T03 por SOFTWARE BASCULA.
 *
 * Dependencias globales del proyecto:
 * - CASTABOT_DATA_SPREADSHEET_ID
 * - utilidades T03 de t03_search.gs
 *
 * No mezcla datos con REPORTES_BASCULA.
 */

function buscarT03FallbackCastabot_(payload) {
  if (!payload) throw new Error('PAYLOAD_NO_RECIBIDO');

  const identifierType = String(
    payload.identifier_type || ''
  ).trim().toUpperCase();

  const identifierValue = String(
    payload.identifier_value || ''
  ).trim();

  if (
    identifierType !== 'MATRICULA' &&
    identifierType !== 'NUMERO_ECONOMICO'
  ) {
    throw new Error('IDENTIFIER_TYPE_INVALIDO');
  }

  const target = normalizarIdentificadorT03_(identifierValue);

  if (!target) {
    throw new Error('IDENTIFIER_VALUE_INVALIDO');
  }

  const spreadsheet = SpreadsheetApp.openById(
    CASTABOT_DATA_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(
    'SOFTWARE BASCULA'
  );

  if (!sheet) {
    throw new Error('SOFTWARE_BASCULA_NOT_FOUND');
  }

  const descriptor = localizarFilaCabeceraT03_(sheet);

  if (!descriptor) {
    throw new Error('SOFTWARE_BASCULA_HEADER_NOT_RECOGNIZED');
  }

  const index =
    identifierType === 'MATRICULA'
      ? descriptor.map.matricula
      : descriptor.map.numeroEconomico;

  if (index < 0) {
    throw new Error('SOFTWARE_BASCULA_IDENTIFIER_COLUMN_NOT_FOUND');
  }

  const lastRow = sheet.getLastRow();
  const records = [];

  if (lastRow > descriptor.headerRow) {
    const count = lastRow - descriptor.headerRow;

    const identifiers = sheet
      .getRange(
        descriptor.headerRow + 1,
        index + 1,
        count,
        1
      )
      .getDisplayValues();

    const maxColumn = Math.max(
      descriptor.map.folio,
      descriptor.map.cliente,
      descriptor.map.matricula,
      descriptor.map.numeroEconomico,
      descriptor.map.operador,
      descriptor.map.producto,
      descriptor.map.pesoBruto,
      descriptor.map.fechaEntrada,
      descriptor.map.horaEntrada,
      descriptor.map.pesoTara,
      descriptor.map.fechaSalida,
      descriptor.map.horaSalida
    ) + 1;

    for (let i = 0; i < identifiers.length; i += 1) {
      if (
        normalizarIdentificadorT03_(identifiers[i][0]) !== target
      ) {
        continue;
      }

      const rowNumber =
        descriptor.headerRow + 1 + i;

      const row = sheet
        .getRange(rowNumber, 1, 1, maxColumn)
        .getDisplayValues()[0];

      records.push(
        filaNormalizadaT03_(
          sheet.getName(),
          rowNumber,
          row,
          descriptor.map
        )
      );
    }
  }

  const seen = {};
  const unique = [];

  records.forEach(function(record) {
    const key = claveRegistroT03_(record);
    if (seen[key]) return;
    seen[key] = true;
    unique.push(record);
  });

  let sourceUpdatedAt = null;

  try {
    sourceUpdatedAt = DriveApp
      .getFileById(CASTABOT_DATA_SPREADSHEET_ID)
      .getLastUpdated()
      .toISOString();
  } catch (error) {
    sourceUpdatedAt = null;
  }

  return {
    ok: true,
    dataset: 'REPORTES_BASCULA',
    identifier_type: identifierType,
    identifier_value: identifierValue,
    records: unique,
    metadata: {
      source_class: 'AUTHORIZED_FALLBACK',
      source_updated_at: sourceUpdatedAt,
      read_at: new Date().toISOString(),
      fallback_used: true,
      fallback_reason:
        String(payload.fallback_reason || '').trim() ||
        'PRIMARY_UNAVAILABLE',
      policy_version: 't03-fallback-v1',
      sheets_scanned: 1,
      sheets_skipped: []
    }
  };
}

/**
 * Integración requerida en doPost:
 *
 * if (accion === 'BUSCAR_T03_FALLBACK_CASTABOT') {
 *   return respuestaJsonCOM_(buscarT03FallbackCastabot_(payload));
 * }
 */
