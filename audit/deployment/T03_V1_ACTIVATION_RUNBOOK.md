# T03 v1 — activation runbook

Estado: READY FOR EXTERNAL DEPLOYMENT.  
No activar el feature antes de completar Gate A y Gate B.

## Gate A — CASTABOT Comunica / Apps Script

El Web App productivo debe contener las acciones:

- `LEER_DATOS_CASTABOT`
- `BUSCAR_T03_CASTABOT`
- `LEER_NORMA_CASTABOT`
- `BUSCAR_T03_FALLBACK_CASTABOT`
- `REGISTRAR_T03_CASTABOT`
- `PROCESAR`
- `ENCOLAR`
- `PING`

Configurar únicamente las referencias backend persistentes necesarias:

- `CASTABOT_NORM_DOCUMENT_ID`
- `CASTABOT_CONTROL_ADMIN_SPREADSHEET_ID`

No usar propiedades `CASTABOT_T03_TEST_*`.

### A1 — pruebas internas seguras

PASS requerido:
- estructura COLA_COM satisfactoria;
- fuente normativa legible + SHA-256;
- búsqueda PRIMARY;
- búsqueda AUTHORIZED_FALLBACK;
- configuración REGISTRO_T03/PANEL_ADMIN.

### A2 — desplegar misma Web App

Actualizar el despliegue existente a nueva versión. No crear una ruta paralela sin necesidad.

### A3 — pruebas HTTP seguras

PASS requerido:
- PING → HTTP 200 / FAST_PATH_DISPONIBLE;
- BUSCAR_T03_CASTABOT → PRIMARY;
- LEER_NORMA_CASTABOT → texto + digest;
- BUSCAR_T03_FALLBACK_CASTABOT → AUTHORIZED_FALLBACK.

No ejecutar REGISTRAR_T03_CASTABOT con un evento artificial en producción.

## Gate B — castabot-mcp

Antes de activar:
- PR CI verde;
- Apps Script dependency gate A completo;
- `CASTABOT_T03_DETERMINISTIC_ENABLED` todavía false.

Desplegar código con feature apagado primero.

Verificar:
- /healthz;
- /mcp-info;
- OpenAPI base actual;
- CONSULTAR_DATOS_CASTABOT;
- ENCOLAR_COM.

Después habilitar:

`CASTABOT_T03_DETERMINISTIC_ENABLED=true`

TTL opcional:
`CASTABOT_PRESTART_TTL_SECONDS=600`

Reiniciar/redeployar y verificar que aparezcan:
- PREARRANQUE_CASTABOT
- EJECUTAR_T03
- POST /prearranque-t03
- POST /ejecutar-t03

## Gate C — E2E controlado

### C1 — PRIMARY

Consulta:
- identificador: C68 T68
- tipo: TARA
- actual: 18990 kg

Esperado:
- 9 históricos;
- promedio mostrado: 18989 kg;
- variación mostrada: 0.01 %;
- verde;
- un solo EVENT_ID;
- COM acreditado sólo con ENVIADO + Telegram message id;
- un solo REGISTRO_T03;
- CONTROL_RELECTURA=SI;
- PANEL_ADMIN incrementado.

### C2 — FALLBACK 66.C.2

Consulta:
- matrícula: 72AM9P
- tipo: TARA
- actual: 18620 kg

Esperado:
- PRIMARY sin historial o indisponible conforme al caso;
- SOFTWARE BASCULA autorizado;
- 7 filas localizadas;
- 6 taras válidas;
- tara 0 excluida;
- promedio mostrado: 18767 kg;
- variación: -0.78 %;
- verde;
- metadata AUTHORIZED_FALLBACK;
- COM y postregistro acreditados.

### C3 — idempotencia

Reintentar la misma operación lógica con el mismo token.

Esperado:
- mismo CONSULTA_ID;
- mismo EVENT_ID;
- no segunda fila COLA_COM;
- no segunda fila REGISTRO_T03.

### C4 — hard gate

Invocar EJECUTAR_T03 sin token o con contexto modificado.

Esperado:
- PRESTART_REQUIRED o PRESTART_CONTEXT_MISMATCH;
- sin promedio;
- sin semáforo;
- sin COM;
- sin postregistro.

## Gate D — promoción

Sólo después de C1–C4:
- revisar trazas;
- mantener evidencia;
- marcar PR listo;
- mergear a main;
- verificar despliegue de main;
- cerrar incidencias únicamente si el comportamiento real quedó acreditado.

## Rollback

Si falla Gate B/C:
1. poner `CASTABOT_T03_DETERMINISTIC_ENABLED=false`;
2. redeploy/restart del MCP;
3. conservar Apps Script compatible;
4. no volver silenciosamente al cálculo T03 por LLM como sustituto del hard gate;
5. corregir en branch y repetir gates.
