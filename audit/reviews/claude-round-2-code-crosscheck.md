# Claude R2 — contraste contra código real

Fecha: 2026-10-06

## Resultado general

La R2 de Claude fue útil como diseño, pero Claude declaró correctamente que no pudo inspeccionar el repositorio. Este documento contrasta sus principales propuestas contra el estado real de `main`.

## Evidencia de código verificada

### Herramientas actuales

`src/index.ts` expone exactamente dos herramientas MCP operativas:

- `CONSULTAR_DATOS_CASTABOT`
- `ENCOLAR_COM`

También expone API HTTPS para:

- `POST /consultar-datos`
- `POST /encolar-com`
- `POST /procesar-com`

No existe actualmente una herramienta T01, T02 o T03 determinista.

### Prearranque

No existe en `src/index.ts`:

- estado de sesión;
- `prestart_verified`;
- token de prearranque;
- validación de conversación;
- middleware que impida cálculo por falta de prearranque.

Las reglas de prearranque y de operación aparecen en instrucciones al modelo, no como gate programático.

**Conclusión:** el diagnóstico de Claude se confirma. Su solución concreta de un almacén completo de sesión todavía NO se adopta: primero debe compararse con una alternativa mínima basada en token/precondición emitida por backend.

### T03

No existe función de cálculo T03 en el repositorio.

La regla de variación absoluta superior a 1.50% y disparo COM está en las instrucciones del servidor para el modelo. No existe función determinista que calcule promedio, variación, clasificación y `com_required`.

**Conclusión:** se confirma que T03 es candidato fuerte para extracción a código. Falta adjudicar si debe ser el primer piloto frente a otras mejoras de menor costo.

### Lectura de datos y fuentes

`CONSULTAR_DATOS_CASTABOT` recibe:

- `dataset`: PENSION / BASCULA / REPORTES_BASCULA
- `range`: rango lógico

y delega al Web App mediante `LEER_DATOS_CASTABOT`.

La salida validada contiene sólo:

- `ok`
- `dataset`
- `rows`
- `error`

No devuelve actualmente:

- `source_used`
- frescura;
- motivo de fallback;
- estado degradado;
- versión de política.

El repositorio MCP no demuestra cómo el Web App decide la fuente física ni el fallback.

**Conclusión:** la observabilidad de fuente propuesta por Claude es válida como mejora, pero NO se debe asumir que la selección de fuente está hoy en el LLM: parte puede estar en el Web App y debe inspeccionarse antes de rediseñarla.

### COM

`event_id` es un campo obligatorio suministrado por el llamador.

El servidor valida longitud/formato básico, pero no deriva el identificador a partir del hecho operativo.

La idempotencia documentada depende de que el mismo `event_id` llegue de nuevo: el Web App evita una segunda fila para ese ID.

**Conclusión:** se confirma el riesgo indicado por Claude: idempotencia por ID no equivale necesariamente a idempotencia por hecho si el llamador puede generar IDs diferentes.

### Autorización COM

`confirmed_by_consultant` debe ser literalmente `SI`.

El esquema admite que represente confirmación humana o autorización normativa automática.

En esta capa no existe una comprobación material contra un registro de confirmación, sesión, identidad o regla específica. La API HTTPS sí valida `CASTABOT_API_KEY`, pero esa autenticación técnica no demuestra la autorización de negocio de cada evento.

**Conclusión:** se confirma que el campo es una declaración del llamador en esta capa, no una prueba material de autorización.

### Productor vs transporte

El productor MCP delega el evento al Web App. Los workflows:

- `com-maintenance.yml` ejecutan `/procesar-com` cada 5 minutos;
- `com-fast-path.yml` verifica salud/lectura y dispara procesamiento al cambiar `com-trigger/**`;
- `tool-exposure.yml` verifica exposición de herramientas y Actions;
- `plus-actions.yml` verifica el esquema OpenAPI.

Esto fortalece la separación entre productor y procesamiento/transporte.

No existe en este repositorio una transición T03 determinista que cree el evento automáticamente.

## Adjudicación provisional de propuestas Claude R2

| Propuesta | Estado |
|---|---|
| Gate de prearranque fuera del prompt | ACEPTADA EN PRINCIPIO |
| Almacén completo de sesión como primera solución | REQUIERE DISEÑO MÍNIMO / POSIBLE SOBREINGENIERÍA |
| T03 determinista | ACEPTADA EN PRINCIPIO |
| `render_payload` estructurado | ACEPTADA EN PRINCIPIO |
| `calc_hash` | REQUIERE JUSTIFICACIÓN; puede ser innecesario inicialmente |
| Máquina de estados T02 | ACEPTADA COMO PATRÓN, requiere revisar escritura real y roles |
| `event_id` construido/validado por backend | ACEPTADA EN PRINCIPIO |
| Evento COM automático desde transición T03 | REQUIERE REGLA DE NEGOCIO Y E2E antes de adoptar |
| Metadatos de fuente/frescura/fallback | ACEPTADA COMO OBSERVABILIDAD |
| Bloquear todo dato degradado | REQUIERE POLÍTICA POR TAREA; no adoptar de forma universal |
| Logger de trazas | ACEPTADO, cuidando no registrar secretos/datos sensibles |
| E2E componentes → sintético → humano | ACEPTADO |

## Alternativa mínima a estudiar para prearranque

Antes de construir persistencia de sesión general, comparar:

### Opción A — sesión persistida
Servidor mantiene `session_state`, identidad, rol, tarea y expiración.

### Opción B — token opaco de prearranque
Una herramienta `PREARRANQUE_CASTABOT` ejecuta las comprobaciones necesarias y devuelve un token corto, firmado/opaco, con:

- versión normativa;
- tarea;
- instante de emisión;
- expiración;
- alcance.

Las herramientas T01/T02/T03 exigen ese token y lo validan. El LLM no puede fabricarlo.

### Opción C — herramienta atómica por tarea
La herramienta T03 hace internamente lectura + precondiciones + cálculo + decisión, reduciendo la necesidad de estado conversacional persistente.

La siguiente revisión debe comparar estas opciones por reducción de riesgo, complejidad, compatibilidad MCP/API y observabilidad.

## Estado antes de Gemini

No modificar producción todavía.

Puntos ya confirmados por código:
1. no hay hard gate programático;
2. no hay motor T03 determinista;
3. `event_id` entra desde el llamador;
4. `confirmed_by_consultant=SI` no es verificación material en esta capa;
5. la lectura operativa no expone metadatos de fuente/frescura;
6. COM tiene infraestructura de procesamiento/verificación separada del productor.

Puntos que aún requieren evidencia:
1. política real de fuente/fallback dentro del Web App;
2. reglas exactas T01/T02/T03;
3. escritura real disponible para T02 y permisos;
4. mejor mecanismo de prearranque mínimo;
5. criterio canónico para construir idempotencia por hecho.
