# WEBAPP_PREARRANQUE_T03 v1 — SUPERSEDIDO

Estado: **SUPERSEDIDO — NO IMPLEMENTAR**.

La propuesta inicial colocaba la verificación del prearranque T03 dentro del Web App COM-S. Esa distribución fue descartada durante la implementación porque mezclaba transporte/cola con el hard gate de operación.

## Arquitectura vigente

Apps Script expone únicamente una fuente normativa de solo lectura:

`LEER_NORMA_CASTABOT`

Responsabilidad:
- abrir efectivamente la fuente normativa configurada;
- devolver el texto leído;
- devolver SHA-256 y metadata de lectura.

Apps Script **no**:
- decide si el prearranque está acreditado;
- emite tokens;
- interpreta el umbral;
- calcula T03;
- autoriza COM.

El hard gate vigente vive en `castabot-mcp`:
1. solicita `LEER_NORMA_CASTABOT`;
2. recomputa SHA-256 del texto recibido;
3. verifica reglas 66.C/T03 codificadas;
4. resuelve disponibilidad PRIMARY/fallback autorizado;
5. sólo entonces emite token opaco ligado al contexto T03.

Implementación vigente:
- `apps-script/norm_source.gs`;
- `src/prestart/source.ts`;
- `src/prestart/rules.ts`;
- `src/prestart/service.ts`;
- `src/prestart/token.ts`.

No reintroducir `VERIFICAR_PREARRANQUE_T03` en COM-S.
