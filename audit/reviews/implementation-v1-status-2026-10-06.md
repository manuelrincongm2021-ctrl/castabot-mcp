# Estado de implementación v1 — 2026-10-06

## Rama
`reengineering-v1-contracts-2026-10-06`

## Producción
SIN CAMBIOS. Main no contiene activación del piloto.

## Completado y verificado

- Contrato PREARRANQUE_CASTABOT v1.
- Contrato EJECUTAR_T03 v1.
- Contrato COM idempotente T03 v1.
- Especificación TEST_ACCEPTANCE_V1.
- Token opaco AES-256-GCM ligado a contexto T03.
- Validación de expiración/manipulación/contexto.
- Identidad idempotente HMAC para consulta/evento.
- Cálculo T03 determinista.
- Umbral exacto 1.50 %.
- Renderer canónico de 10 columnas.
- Parser/validador de respuesta T03 de fuente.
- Esquema vivo de REPORTES DE BASCULA 2026 inspeccionado.
- Parche Apps Script BUSCAR_T03_CASTABOT preparado.
- Parche Apps Script VERIFICAR_PREARRANQUE_T03 preparado.
- Adaptador MCP para acreditar verificación backend antes de firmar token.
- Unit tests agregados.
- CI ejecutado.

## Evidencia CI final

Head verificado: `040622fbe6de417e655253d3bdd86dfce4b234a7`

- TypeScript check: PASS
- Unit tests: PASS
- Build: PASS
- Tool Exposure: PASS
- Plus Actions: PASS

Durante el desarrollo hubo dos fallos de test previos que fueron corregidos antes de declarar éxito:
1. glob no portable del runner;
2. precedencia de validación que ocultaba el error específico de checks faltantes.

## Dependencia externa restante

El proyecto Apps Script productivo no está disponible como recurso editable desde los conectores de esta sesión.

Por tanto:
- `apps-script/t03_search.gs` está preparado pero NO desplegado;
- `apps-script/prestart_t03.gs` está preparado pero NO desplegado;
- no existe todavía acción productiva `BUSCAR_T03_CASTABOT`;
- no existe todavía acción productiva `VERIFICAR_PREARRANQUE_T03`.

ARCHIVO EN GITHUB ≠ WEB APP DESPLEGADO.

## Gate siguiente

Para continuar hacia activación real:
1. incorporar ambos parches al proyecto Apps Script productivo;
2. agregar dispatch en doPost;
3. configurar propiedad privada de la fuente normativa;
4. redeplegar Web App;
5. verificar ambas acciones reales;
6. sólo entonces exponer PREARRANQUE_CASTABOT/EJECUTAR_T03 en MCP bajo feature flags;
7. ejecutar TEST_ACCEPTANCE_V1;
8. mantener COM automático deshabilitado hasta D/E PASS.

## Estado

Núcleo puro: VERIFICADO.
Adaptadores: PREPARADOS.
Despliegue Web App: PENDIENTE POR FALTA DE CANAL DE ESCRITURA APPS SCRIPT.
Producción: NO MODIFICADA.
