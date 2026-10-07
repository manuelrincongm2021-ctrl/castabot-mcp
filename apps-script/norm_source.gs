/**
 * CASTABOT — puente de lectura normativa.
 *
 * Responsabilidad limitada:
 * - leer efectivamente la fuente normativa configurada;
 * - devolver texto + digest + metadata.
 *
 * NO decide T03, NO emite tokens, NO calcula, NO produce COM.
 *
 * Requiere Script Property:
 * CASTABOT_NORM_DOCUMENT_ID
 */

function textoTabNormaCastabot_(tab) {
  let texto = '';

  try {
    texto += tab.asDocumentTab().getBody().getText() + '\n';
  } catch (error) {
    // Los tabs no documentales no aportan texto.
  }

  const hijos =
    typeof tab.getChildTabs === 'function'
      ? tab.getChildTabs()
      : [];

  hijos.forEach(function(hijo) {
    texto += textoTabNormaCastabot_(hijo);
  });

  return texto;
}

function textoNormaCompletaCastabot_(documento) {
  if (typeof documento.getTabs === 'function') {
    return documento
      .getTabs()
      .map(textoTabNormaCastabot_)
      .join('\n');
  }

  return documento.getBody().getText();
}

function digestSha256HexCastabot_(texto) {
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

function leerNormaCastabot_() {
  const normId = PropertiesService
    .getScriptProperties()
    .getProperty('CASTABOT_NORM_DOCUMENT_ID');

  if (!normId) {
    throw new Error('NORM_SOURCE_NOT_CONFIGURED');
  }

  const documento = DocumentApp.openById(normId);
  const texto = textoNormaCompletaCastabot_(documento);

  if (!String(texto || '').trim()) {
    throw new Error('NORM_SOURCE_EMPTY');
  }

  let updatedAt = null;

  try {
    updatedAt = DriveApp
      .getFileById(normId)
      .getLastUpdated()
      .toISOString();
  } catch (error) {
    updatedAt = null;
  }

  return {
    ok: true,
    source: 'CASTABOT_NORM',
    text: texto,
    digest_sha256: digestSha256HexCastabot_(texto),
    updated_at: updatedAt,
    read_at: new Date().toISOString()
  };
}

/**
 * Integración requerida en doPost:
 *
 * if (accion === 'LEER_NORMA_CASTABOT') {
 *   return respuestaJsonCOM_(leerNormaCastabot_());
 * }
 */
