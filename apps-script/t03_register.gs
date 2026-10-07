/**
 * CASTABOT — postregistro T03 en Control Administrativo.
 *
 * Responsabilidad:
 * - registrar únicamente T03 cuyo COM ya fue acreditado por MCP;
 * - aplicar idempotencia por REGISTRO_ID / CONSULTA_ID;
 * - releer la fila escrita;
 * - comprobar actualización del PANEL_ADMIN.
 *
 * NO calcula T03 y NO envía COM.
 *
 * Requiere Script Property:
 * CASTABOT_CONTROL_ADMIN_SPREADSHEET_ID
 */

function obtenerControlAdminT03_() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty('CASTABOT_CONTROL_ADMIN_SPREADSHEET_ID');

  if (!id) {
    throw new Error('CONTROL_ADMIN_SOURCE_NOT_CONFIGURED');
  }

  return SpreadsheetApp.openById(id);
}

function textoT03Registro_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function metricasPanelT03_(ss) {
  const sheet = ss.getSheetByName('PANEL_ADMIN');
  if (!sheet) throw new Error('PANEL_ADMIN_NOT_FOUND');

  const lastRow = Math.min(Math.max(sheet.getLastRow(), 1), 80);
  const rows = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
  const result = {};

  rows.forEach(function(row) {
    const label = textoT03Registro_(row[0]);
    if (
      label === 'T03 consultas' ||
      label === 'T03 fuera de rango' ||
      label === 'T03 pendientes de resolución'
    ) {
      const n = Number(String(row[1] || '').replace(/,/g, ''));
      result[label] = Number.isFinite(n) ? n : null;
    }
  });

  return result;
}

function buscarRegistroT03Existente_(sheet, registroId, consultaId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet
    .getRange(2, 1, lastRow - 1, 2)
    .getDisplayValues();

  for (let i = 0; i < values.length; i += 1) {
    const a = textoT03Registro_(values[i][0]);
    const b = textoT03Registro_(values[i][1]);

    if (
      (registroId && a === registroId) ||
      (consultaId && b === consultaId)
    ) {
      return i + 2;
    }
  }

  return null;
}

function validarRegistroT03Payload_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('T03_REGISTER_PAYLOAD_INVALID');
  }

  const requiredText = [
    'registro_id',
    'consulta_id',
    'identificador_solicitado',
    'tipo_peso',
    'clasificacion_rango',
    'decision_t03',
    'fuente_resultado'
  ];

  requiredText.forEach(function(key) {
    if (!textoT03Registro_(raw[key])) {
      throw new Error('T03_REGISTER_MISSING_' + key.toUpperCase());
    }
  });

  const requiredNumber = [
    'peso_actual_kg',
    'promedio_historico_kg',
    'diferencia_kg',
    'variacion_pct',
    'registros_comparables'
  ];

  requiredNumber.forEach(function(key) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) {
      throw new Error('T03_REGISTER_INVALID_' + key.toUpperCase());
    }
  });

  return raw;
}

function registrarT03Castabot_(payload) {
  const registro = validarRegistroT03Payload_(
    payload && payload.registro
  );

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error('T03_REGISTER_LOCK_UNAVAILABLE');
  }

  try {
    const ss = obtenerControlAdminT03_();
    const sheet = ss.getSheetByName('REGISTRO_T03');

    if (!sheet) {
      throw new Error('REGISTRO_T03_NOT_FOUND');
    }

    const registroId = textoT03Registro_(registro.registro_id);
    const consultaId = textoT03Registro_(registro.consulta_id);
    const existente = buscarRegistroT03Existente_(
      sheet,
      registroId,
      consultaId
    );

    if (existente) {
      const row = sheet
        .getRange(existente, 1, 1, 23)
        .getDisplayValues()[0];

      const controlRelecturaExistente =
        textoT03Registro_(row[21]).toUpperCase();

      if (controlRelecturaExistente !== 'SI') {
        throw new Error('T03_REGISTER_DUPLICATE_NOT_VERIFIED');
      }

      const panelActual = metricasPanelT03_(ss);
      const consultasPanel = Number(panelActual['T03 consultas']);

      if (!Number.isFinite(consultasPanel) || consultasPanel < 1) {
        throw new Error('T03_REGISTER_PANEL_NOT_VERIFIED');
      }

      return {
        ok: true,
        registrado: false,
        duplicado: true,
        registro_id: textoT03Registro_(row[0]),
        consulta_id: textoT03Registro_(row[1]),
        fila: existente,
        control_relectura: 'SI',
        panel_actualizado: true
      };
    }

    const panelAntes = metricasPanelT03_(ss);
    const tz =
      typeof COM_TIMEZONE !== 'undefined'
        ? COM_TIMEZONE
        : 'America/Mexico_City';

    const now = new Date();
    const fechaHora = Utilities.formatDate(
      now,
      tz,
      'yyyy-MM-dd HH:mm:ss'
    );
    const fechaOperativa = Utilities.formatDate(
      now,
      tz,
      'yyyy-MM-dd'
    );

    const fuera =
      textoT03Registro_(registro.clasificacion_rango)
        .toUpperCase() === 'FUERA DE RANGO';

    const rowNumber = sheet.getLastRow() + 1;

    const row = [[
      registroId,
      consultaId,
      fechaHora,
      fechaOperativa,
      textoT03Registro_(registro.identificador_solicitado),
      textoT03Registro_(registro.matricula),
      textoT03Registro_(registro.numero_economico),
      textoT03Registro_(registro.tipo_peso),
      Number(registro.peso_actual_kg),
      Number(registro.promedio_historico_kg),
      Number(registro.diferencia_kg),
      Number(registro.variacion_pct),
      Number(registro.registros_comparables),
      textoT03Registro_(registro.clasificacion_rango),
      textoT03Registro_(registro.decision_t03),
      textoT03Registro_(registro.observacion),
      textoT03Registro_(registro.fuente_resultado),
      'SI',
      '',
      fuera ? 'PENDIENTE DE RESOLUCIÓN' : 'NO APLICA',
      '',
      '',
      textoT03Registro_(registro.consultante_responsable)
    ]];

    sheet
      .getRange(rowNumber, 1, 1, 23)
      .setValues(row);

    SpreadsheetApp.flush();

    const reread = sheet
      .getRange(rowNumber, 1, 1, 23)
      .getDisplayValues()[0];

    if (
      textoT03Registro_(reread[0]) !== registroId ||
      textoT03Registro_(reread[1]) !== consultaId ||
      textoT03Registro_(reread[17]).toUpperCase() !== 'SI'
    ) {
      throw new Error('T03_REGISTER_REREAD_FAILED');
    }

    sheet.getRange(rowNumber, 22).setValue('SI');
    SpreadsheetApp.flush();

    const controlRelectura = textoT03Registro_(
      sheet.getRange(rowNumber, 22).getDisplayValue()
    );

    if (controlRelectura !== 'SI') {
      throw new Error('T03_REGISTER_CONTROL_REREAD_FAILED');
    }

    const panelDespues = metricasPanelT03_(ss);
    const consultasAntes = Number(panelAntes['T03 consultas']);
    const consultasDespues = Number(panelDespues['T03 consultas']);

    const panelActualizado =
      Number.isFinite(consultasAntes) &&
      Number.isFinite(consultasDespues) &&
      consultasDespues === consultasAntes + 1;

    if (!panelActualizado) {
      throw new Error('T03_REGISTER_PANEL_NOT_UPDATED');
    }

    return {
      ok: true,
      registrado: true,
      duplicado: false,
      registro_id: registroId,
      consulta_id: consultaId,
      fila: rowNumber,
      control_relectura: 'SI',
      panel_actualizado: true
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Integración requerida en doPost:
 *
 * if (accion === 'REGISTRAR_T03_CASTABOT') {
 *   return respuestaJsonCOM_(registrarT03Castabot_(payload));
 * }
 */
