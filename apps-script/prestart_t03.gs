/**
 * CASTABOT — verificación backend del prearranque T03.
 *
 * PARCHE DE FUENTE. NO SE ACTIVA POR EXISTIR EN GITHUB.
 *
 * Requiere Script Property:
 * CASTABOT_NORM_DOCUMENT_ID
 *
 * No hardcodear el ID normativo en este repositorio público.
 */

function textoTabDocumentoCastabot_(tab) {
  let texto = '';

  try {
    texto += tab.asDocumentTab().getBody().getText() + '\n';
  } catch (error) {
    // Tabs que no sean DocumentTab no aportan texto normativo.
  }

  const hijos = typeof tab.getChildTabs === 'function'
    ? tab.getChildTabs()
    : [];

  hijos.forEach(function(hijo) {
    texto += textoTabDocumentoCastabot_(hijo);
  });

  return texto;
}

function textoDocumentoCompletoCastabot_(documento) {
  if (typeof documento.getTabs === 'function') {
    return documento
      .getTabs()
      .map(textoTabDocumentoCastabot_)
      .join('\n');
  }

  return documento.getBody().getText();
}

function normalizarNormaCastabot_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function digestHexCastabot_(texto) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function(b) {
      const value = b < 0 ? b + 256 : b;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

function verificarContextoT03Prearranque_(payload) {
  const identifierType = String(payload.identifier_type || '').trim().toUpperCase();
  const identifierValue = String(payload.identifier_value || '').trim();
  const weightType = String(payload.weight_type || '').trim().toUpperCase();
  const currentWeightKg = Number(payload.current_weight_kg);

  if (identifierType !== 'MATRICULA' && identifierType !== 'NUMERO_ECONOMICO') {
    throw new Error('IDENTIFIER_TYPE_INVALIDO');
  }
  if (!identifierValue) {
    throw new Error('IDENTIFIER_VALUE_INVALIDO');
  }
  if (weightType !== 'BRUTO' && weightType !== 'TARA') {
    throw new Error('WEIGHT_TYPE_INVALIDO');
  }
  if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) {
    throw new Error('CURRENT_WEIGHT_INVALIDO');
  }

  return {
    identifier_type: identifierType,
    identifier_value: identifierValue,
    weight_type: weightType,
    current_weight_kg: currentWeightKg
  };
}

/**
 * Lee efectivamente la fuente normativa vigente y acredita sólo los
 * marcadores necesarios para habilitar el piloto T03.
 *
 * @param {Object} payload
 * @return {Object}
 */
function verificarPrearranqueT03Castabot_(payload) {
  if (!payload) throw new Error('PAYLOAD_NO_RECIBIDO');

  const mode = String(payload.mode || '').trim().toUpperCase();
  const task = String(payload.task || '').trim().toUpperCase();

  if (mode !== 'OPERATIVO') throw new Error('MODE_NOT_ALLOWED');
  if (task !== 'T03') throw new Error('TASK_NOT_ALLOWED');

  const context = verificarContextoT03Prearranque_(payload);

  const normId = PropertiesService
    .getScriptProperties()
    .getProperty('CASTABOT_NORM_DOCUMENT_ID');

  if (!normId) {
    throw new Error('NORM_SOURCE_NOT_CONFIGURED');
  }

  const documento = DocumentApp.openById(normId);
  const textoNorma = textoDocumentoCompletoCastabot_(documento);
  const norma = normalizarNormaCastabot_(textoNorma);

  // Marcadores materiales del contrato T03 vigente.
  const requiredMarkers = [
    'T03',
    'PESOS PROMEDIO',
    'ABS(VARIACION %) <= 1.50 %',
    'ABS(VARIACION %) > 1.50 %',
    'COM AUTOMATICO T03',
    'CONTROL PRE-RESPUESTA OBLIGATORIO EN TODO CHAT NUEVO'
  ];

  const missingMarkers = requiredMarkers.filter(function(marker) {
    return norma.indexOf(normalizarNormaCastabot_(marker)) < 0;
  });

  if (missingMarkers.length) {
    return {
      ok: false,
      code: 'NORM_RULESET_INCOMPLETE',
      missing_markers: missingMarkers
    };
  }

  // Resolver la ruta de datos sin leer resultados históricos todavía.
  const reportes = SpreadsheetApp.openById(REPORTES_SPREADSHEET_ID);
  const sheets = reportes.getSheets();

  if (!sheets.length) {
    return {
      ok: false,
      code: 'DATA_ROUTE_UNAVAILABLE'
    };
  }

  let normUpdatedAt = null;
  let dataUpdatedAt = null;

  try {
    normUpdatedAt = DriveApp.getFileById(normId).getLastUpdated().toISOString();
  } catch (error) {
    normUpdatedAt = null;
  }

  try {
    dataUpdatedAt = DriveApp
      .getFileById(REPORTES_SPREADSHEET_ID)
      .getLastUpdated()
      .toISOString();
  } catch (error) {
    dataUpdatedAt = null;
  }

  return {
    ok: true,
    task: 'T03',
    mode: 'OPERATIVO',
    context: context,
    checks: [
      { name: 'NORM_CURRENT', passed: true },
      { name: 'RULE_T03_RESOLVED', passed: true },
      { name: 'DATA_ROUTE_RESOLVED', passed: true },
      { name: 'INPUT_COMPLETE', passed: true }
    ],
    norm: {
      digest_sha256: digestHexCastabot_(textoNorma),
      updated_at: normUpdatedAt
    },
    data_route: {
      dataset: 'REPORTES_BASCULA',
      source_class: 'PRIMARY',
      updated_at: dataUpdatedAt,
      sheet_count: sheets.length
    },
    contract_version: 'prestart-backend-v1',
    verified_at: new Date().toISOString()
  };
}

/**
 * INTEGRACIÓN REQUERIDA EN doPost:
 *
 * if (accion === 'VERIFICAR_PREARRANQUE_T03') {
 *   return respuestaJsonCOM_(verificarPrearranqueT03Castabot_(payload));
 * }
 */
