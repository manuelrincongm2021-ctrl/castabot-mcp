# CASTABOT reengineering v1 — implementation status

Fecha de corte: 2026-10-06 / 2026-10-07 UTC.
Rama: `reengineering-v1-contracts-2026-10-06`.
Estado: **implementación de código completa para piloto T03; activación productiva todavía bloqueada por despliegues externos y E2E humano**.

## 1. Resultado arquitectónico

Se mantiene la decisión de reingeniería parcial:
- el LLM detecta intención y presenta el resultado;
- el backend acredita el prearranque y ejecuta invariantes deterministas;
- Apps Script conserva COM-S y actúa como puente autorizado de datos/norma/postregistro;
- T03 no depende del LLM para promedio, diferencia, variación, semáforo, CONSULTA_ID ni EVENT_ID.

## 2. Hard gate T03

Implementado:
- token opaco AES-256-GCM;
- TTL configurable;
- binding a identificador, tipo de peso y peso actual;
- JTI backend;
- digest canónico de contexto;
- lectura normativa por backend;
- recomputación SHA-256 del texto recibido;
- comprobación de marcadores vigentes 66.C/T03;
- resolución de ruta de datos PRIMARY o AUTHORIZED_FALLBACK;
- fail closed si norma o ruta no pueden acreditarse.

Feature flag:
`CASTABOT_T03_DETERMINISTIC_ENABLED` permanece **false por defecto**.

## 3. Fuentes T03

### Primaria

Acción publicada y verificada manualmente:
`BUSCAR_T03_CASTABOT`.

Prueba real:
- unidad: C68 T68;
- fuente: PRIMARY;
- registros: 9;
- fallback: false;
- Web App publicado: HTTP 200.

### Fallback autorizado

Código preparado:
`BUSCAR_T03_FALLBACK_CASTABOT` → `SOFTWARE BASCULA`.

Caso normativo de aceptación incorporado a tests:
- matrícula: 72AM9P;
- 7 filas localizadas;
- 6 taras válidas;
- 1 tara 0 abierta excluida;
- tara actual: 18,620 kg;
- promedio mostrado: 18,767 kg;
- variación mostrada: -0.78 %;
- decisión: APROBADO PARA PESAR.

No mezcla fuentes en una misma ejecución.

## 4. Cálculo y render

Implementado en TypeScript:
- selección mismo tipo BRUTO/TARA;
- exclusión de 0, ausente, inválido y unidad discordante;
- REVIEW_REQUIRED disponible para casos marcados objetivamente por la fuente/regla;
- promedio con precisión interna;
- diferencia;
- variación;
- umbral exacto `ABS(var) <= 1.50`;
- exactamente 1.50 % dentro;
- tabla Markdown de 10 columnas;
- PESO NETO ausente;
- cuatro líneas canónicas;
- semáforo exacto como última línea operacional.

## 5. Identidad e idempotencia COM

Implementado:
- CONSULTA_ID y EVENT_ID derivados por HMAC;
- mismo token/contexto => misma identidad;
- token nuevo => consulta nueva;
- un evento T03 por consulta;
- fuera de rango: el mismo evento lleva escalamiento, no se duplica.

## 6. COM T03

Implementado en código:
- caption compacto con hechos esenciales;
- productor COM oficial;
- acreditación únicamente cuando:
  - STATUS = ENVIADO; y
  - TELEGRAM_MESSAGE_ID presente;
- si queda no terminal, se permite PROCESAR + relectura idempotente;
- no se declara acreditado con PENDIENTE/ENVIANDO/FALLIDO.

## 7. Postregistro T07 / REGISTRO_T03

Implementado en código:
- sólo después de COM acreditado;
- idempotencia por REGISTRO_ID / CONSULTA_ID;
- escritura de 23 columnas canónicas;
- flush + relectura;
- CONTROL_RELECTURA = SI;
- verificación de PANEL_ADMIN;
- duplicado existente exige CONTROL_RELECTURA=SI;
- respuesta backend exige `panel_actualizado=true`.

Corrección real ya ejecutada y releída en PANEL_ADMIN:
- fórmula de “T03 pendientes de resolución” cambió de coincidencia exacta `PENDIENTE` a `PENDIENTE*`;
- resultado actual releído: 3 pendientes, consistente con registros históricos existentes.

## 8. Apps Script

El código fuente de rama contiene:
- `t03_search.gs`;
- `t03_fallback.gs`;
- `norm_source.gs`;
- `t03_register.gs`.

Se eliminó el antiguo `prestart_t03.gs`: COM-S no debe ser dueño del hard gate.

CI valida sintaxis de todos los `.gs`.

## 9. MCP / HTTP / OpenAPI

Implementado detrás de feature flag:
- `PREARRANQUE_CASTABOT`;
- `EJECUTAR_T03`;
- `POST /prearranque-t03`;
- `POST /ejecutar-t03`;
- exposición OpenAPI/Plus sólo si el feature está habilitado.

El flujo protegido es:

`PREARRANQUE → FUENTE → CÁLCULO/RENDER → COM → ACREDITACIÓN → POSTREGISTRO → RESULTADO OPERATIVO COMPLETO`.

## 10. Pruebas automatizadas

Cubiertas:
- token emitido/verificado;
- expiración;
- contexto distinto;
- manipulación/codificación no canónica;
- norma incompleta;
- digest normativo;
- ruta de datos;
- PRIMARY y fallback autorizado;
- 72AM9P;
- umbral +1.50 / +1.51 / -1.50 / -1.51;
- ceros;
- ausencia de historia;
- review required;
- render canónico;
- idempotencia;
- COM terminal;
- relectura COM;
- postregistro;
- scripted E2E;
- intento de saltar prearranque.

Último head verificado por CI: `c36a538d7881b9ed61b8d0022e10c05f18ee76fb`.
Resultado:
- Tool Exposure: PASS;
- Plus Actions: PASS;
- MCP CI: PASS;
- Apps Script syntax: PASS;
- Unit tests: PASS;
- TypeScript: PASS;
- Build: PASS.

## 11. Bloqueos externos antes de producción

No son huecos de lógica pendientes en el repositorio; requieren acceso a superficies no controlables desde este chat:

1. incorporar en el Apps Script productivo:
   - `LEER_NORMA_CASTABOT`;
   - `BUSCAR_T03_FALLBACK_CASTABOT`;
   - `REGISTRAR_T03_CASTABOT`;
2. configurar en ese proyecto:
   - `CASTABOT_NORM_DOCUMENT_ID`;
   - `CASTABOT_CONTROL_ADMIN_SPREADSHEET_ID`;
3. desplegar una nueva versión del Web App y verificar las nuevas acciones;
4. desplegar el branch/merge en el servidor MCP;
5. habilitar `CASTABOT_T03_DETERMINISTIC_ENABLED=true`;
6. ejecutar E2E humano controlado con COM real, Telegram terminal y postregistro;
7. retest en chat nuevo/cuenta secundaria antes de cerrar incidencias.

## 12. Criterio de cierre

Código implementado != producción activada.
CI verde != E2E real.
COM encolado != enviado.
Postregistro escrito != postregistro releído.
Incidencia corregida en código != incidencia funcional cerrada.

No cerrar T03/prearranque universal hasta que los bloqueos externos del punto 11 tengan evidencia real satisfactoria.
