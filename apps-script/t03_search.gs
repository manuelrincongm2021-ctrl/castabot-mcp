/**
 * CASTABOT — búsqueda T03 encapsulada para REPORTES_BASCULA.
 *
 * PARCHE DE FUENTE. NO SE ACTIVA POR EXISTIR EN GITHUB.
 * Debe incorporarse al Web App COM oficial y desplegarse.
 *
 * Dependencia: usa REPORTES_SPREADSHEET_ID ya configurado en el proyecto
 * productivo. No contiene IDs ni secretos.
 */

function normalizarCabeceraT03_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizarIdentificadorT03_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function numeroKgT03_(valor) {
  const limpio = String(valor || '')
    .replace(/[$,\s]/g, '')
    .trim();

  if (!limpio) return null;

  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function indiceCabeceraT03_(cabeceras, aliases) {
  const normalizadas = cabeceras.map(normalizarCabeceraT03_);
  for (let i = 0; i < aliases.length; i += 1) {
    const objetivo = normalizarCabeceraT03_(aliases[i]);
    const index = normalizadas.indexOf(objetivo);
    if (index >= 0) return index;
  }
  return -1;
}

function mapaCabecerasT03_(cabeceras) {
  return {
    folio: indiceCabeceraT03_(cabeceras, ['FOLIO', 'ID']),
    cliente: indiceCabeceraT03_(cabeceras, ['CLIENTE']),
    matricula: indiceCabeceraT03_(cabeceras, ['MATRICULA']),
    numeroEconomico: indiceCabeceraT03_(cabeceras, [
      'NO ECONOMICO',
      'NO ECON',
      'NO. ECOCOM',
      'NUM ECONOMICO',
      'NUMERO ECONOMICO'
    ]),
    operador: indiceCabeceraT03_(cabeceras, ['CONDUCTOR', 'OPERADOR']),
    producto: indiceCabeceraT03_(cabeceras, ['PRODUCTO', 'PRODUCTI']),
    pesoBruto: indiceCabeceraT03_(cabeceras, ['PESO BRUTO', 'P. BRUTO', 'BRUTO']),
    fechaEntrada: indiceCabeceraT03_(cabeceras, [
      'FECHA ENTRADA',
      'FECHA DE ENTRADA',
      'F ENTRADA'
    ]),
    horaEntrada: indiceCabeceraT03_(cabeceras, [
      'HORA ENTRADA',
      'HORA DE ENTRADA',
      'H ENTRADA'
    ]),
    pesoTara: indiceCabeceraT03_(cabeceras, ['PESO TARA', 'P. TARA', 'TARA']),
    fechaSalida: indiceCabeceraT03_(cabeceras, [
      'FECHA SALIDA',
      'FECHA DE SALIDA',
      'F SALIDA'
    ]),
    horaSalida: indiceCabeceraT03_(cabeceras, [
      'HORA SALIDA',
      'HORA DE SALIDA',
      'H SALIDA'
    ])
  };
}

function localizarFilaCabeceraT03_(sheet) {
  const maxColumn = Math.min(sheet.getMaxColumns(), 26);
  const primeras = sheet.getRange(1, 1, Math.min(3, sheet.getMaxRows()), maxColumn)
    .getDisplayValues();

  for (let r = 0; r < primeras.length; r += 1) {
    const mapa = mapaCabecerasT03_(primeras[r]);
    if (
      mapa.matricula >= 0 &&
      mapa.pesoBruto >= 0 &&
      mapa.fechaEntrada >= 0
    ) {
      return {
        headerRow: r + 1,
        headers: primeras[r],
        map: mapa
      };
    }
  }

  return null;
}

function valorT03_(row, index) {
  return index >= 0 && index < row.length ? row[index] : '';
}

function filaNormalizadaT03_(sheetName, rowNumber, row, map) {
  return {
    source_sheet: sheetName,
    source_row: rowNumber,
    folio: valorT03_(row, map.folio) || null,
    cliente: valorT03_(row, map.cliente) || null,
    matricula: valorT03_(row, map.matricula) || null,
    numero_economico: valorT03_(row, map.numeroEconomico) || null,
    operador: valorT03_(row, map.operador) || null,
    producto: valorT03_(row, map.producto) || null,
    peso_bruto_kg: numeroKgT03_(valorT03_(row, map.pesoBruto)),
    fecha_entrada: valorT03_(row, map.fechaEntrada) || null,
    hora_entrada: valorT03_(row, map.horaEntrada) || null,
    peso_tara_kg: numeroKgT03_(valorT03_(row, map.pesoTara)),
    fecha_salida: valorT03_(row, map.fechaSalida) || null,
    hora_salida: valorT03_(row, map.horaSalida) || null
  };
}

function claveRegistroT03_(registro) {
  return [
    registro.folio || '',
    normalizarIdentificadorT03_(registro.matricula),
    normalizarIdentificadorT03_(registro.numero_economico),
    registro.fecha_entrada || '',
    registro.peso_bruto_kg == null ? '' : registro.peso_bruto_kg,
    registro.peso_tara_kg == null ? '' : registro.peso_tara_kg
  ].join('|');
}

/**
 * Busca por matrícula o número económico en todas las pestañas del
 * spreadsheet autorizado. Lee únicamente las columnas identificadoras
 * para descubrir coincidencias y luego recupera las filas completas
 * coincidentes.
 *
 * @param {Object} payload
 * @return {Object}
 */
function buscarT03Castabot_(payload) {
  if (!payload) throw new Error('PAYLOAD_NO_RECIBIDO');

  const identifierType = String(payload.identifier_type || '').trim().toUpperCase();
  const identifierValue = String(payload.identifier_value || '').trim();

  if (identifierType !== 'MATRICULA' && identifierType !== 'NUMERO_ECONOMICO') {
    throw new Error('IDENTIFIER_TYPE_INVALIDO');
  }

  const target = normalizarIdentificadorT03_(identifierValue);
  if (!target) throw new Error('IDENTIFIER_VALUE_INVALIDO');

  const spreadsheet = SpreadsheetApp.openById(REPORTES_SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();
  const matches = [];
  const skippedSheets = [];

  sheets.forEach(function(sheet) {
    const descriptor = localizarFilaCabeceraT03_(sheet);

    if (!descriptor) {
      skippedSheets.push({
        sheet: sheet.getName(),
        reason: 'HEADER_NOT_RECOGNIZED'
      });
      return;
    }

    const index =
      identifierType === 'MATRICULA'
        ? descriptor.map.matricula
        : descriptor.map.numeroEconomico;

    if (index < 0) {
      skippedSheets.push({
        sheet: sheet.getName(),
        reason: 'IDENTIFIER_COLUMN_NOT_FOUND'
      });
      return;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= descriptor.headerRow) return;

    const count = lastRow - descriptor.headerRow;
    const identifiers = sheet
      .getRange(descriptor.headerRow + 1, index + 1, count, 1)
      .getDisplayValues();

    const matchingRows = [];
    for (let i = 0; i < identifiers.length; i += 1) {
      if (normalizarIdentificadorT03_(identifiers[i][0]) === target) {
        matchingRows.push(descriptor.headerRow + 1 + i);
      }
    }

    if (!matchingRows.length) return;

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

    matchingRows.forEach(function(rowNumber) {
      const row = sheet
        .getRange(rowNumber, 1, 1, maxColumn)
        .getDisplayValues()[0];

      matches.push(
        filaNormalizadaT03_(
          sheet.getName(),
          rowNumber,
          row,
          descriptor.map
        )
      );
    });
  });

  // El mismo pesaje puede existir en una pestaña general y una histórica.
  // Se deduplica por datos canónicos del registro, no por nombre de pestaña.
  const seen = {};
  const records = [];

  matches.forEach(function(record) {
    const key = claveRegistroT03_(record);
    if (seen[key]) return;
    seen[key] = true;
    records.push(record);
  });

  let sourceUpdatedAt = null;
  try {
    sourceUpdatedAt = DriveApp
      .getFileById(REPORTES_SPREADSHEET_ID)
      .getLastUpdated()
      .toISOString();
  } catch (error) {
    // La falta de metadata Drive no invalida una lectura Sheets satisfactoria.
    sourceUpdatedAt = null;
  }

  return {
    ok: true,
    dataset: 'REPORTES_BASCULA',
    identifier_type: identifierType,
    identifier_value: identifierValue,
    records: records,
    metadata: {
      source_class: 'PRIMARY',
      source_updated_at: sourceUpdatedAt,
      read_at: new Date().toISOString(),
      fallback_used: false,
      fallback_reason: null,
      policy_version: 't03-source-v1',
      sheets_scanned: sheets.length,
      sheets_skipped: skippedSheets
    }
  };
}

/**
 * INTEGRACIÓN REQUERIDA EN doPost:
 *
 * if (accion === 'BUSCAR_T03_CASTABOT') {
 *   return respuestaJsonCOM_(buscarT03Castabot_(payload));
 * }
 */
