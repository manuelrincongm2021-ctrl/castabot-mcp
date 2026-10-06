# Adjudicación multimodelo — Claude R2 vs Gemini vs código real

Fecha: 2026-10-06
Estado: ARQUITECTURA EN DISEÑO — SIN CAMBIOS DE PRODUCCIÓN

## Fuentes consideradas

- Claude R2 (diseño de reingeniería parcial).
- Gemini revisión adversarial posterior.
- Contraste directo con `src/index.ts`, README y workflows de `main`.
- Estado COM-S e incidencias ya verificadas durante el diagnóstico de desarrollo.

## Dictamen global

**REINGENIERÍA PARCIAL.**

No hay evidencia para reconstrucción total. La infraestructura COM-S, MCP/API, workflows y capa de datos deben conservarse. El problema prioritario está en la frontera entre reglas expresadas al LLM y garantías que deberían ejecutarse de forma determinista.

## Decisiones adjudicadas

### 1. Prearranque

**DECISIÓN:** aceptar un hard gate fuera del prompt, pero NO una sesión persistida completa como primera implementación.

Gemini acierta al señalar posible sobreingeniería en `session_state` completo. Claude acierta en que un flag enviado por el LLM no sirve.

**Arquitectura elegida v1:** token opaco, firmado y de corta duración emitido por una operación de prearranque controlada por backend.

**Corrección a Gemini:** la herramienta no debe llamarse necesariamente `INICIAR_TURNO`, porque el prearranque aplica también a desarrollo, entrenamiento y tareas no ligadas a un turno. Nombre de diseño: `PREARRANQUE_CASTABOT`.

El token NO debe emitirse sólo porque el LLM diga que leyó la norma. La operación de prearranque debe verificar por una vía controlada las condiciones mínimas que pretende acreditar. El token representa únicamente los checks realmente ejecutados por backend.

### 2. T03 determinista

**DECISIÓN:** aceptado como primer piloto de extracción de lógica.

Mover a backend:
- consulta de históricos aplicables;
- selección de históricos válidos;
- promedio;
- diferencia;
- variación porcentual;
- comparación con umbral;
- clasificación;
- decisión;
- `com_required`;
- construcción de payload canónico.

El LLM conserva intención, aclaraciones, explicación y conversación.

**Corrección a Gemini:** no se adopta como rollback operativo que el LLM vuelva a calcular si la herramienta falla. Eso reintroduciría el mismo riesgo. El rollback debe ser de despliegue/feature flag en desarrollo, no un fallback automático de producción al cálculo estocástico.

### 3. Render T03

Gemini propone Markdown terminado desde backend. Claude propone estructura + `render_payload`.

**DECISIÓN:** combinación mínima:
- backend devuelve resultado estructurado como fuente de verdad;
- el mismo backend genera además `canonical_markdown` de forma determinista;
- el LLM muestra el bloque canónico sin recalcular y puede añadir explicación fuera de él.

Esto evita que Markdown sea la única representación de negocio y evita que el LLM tenga que reconstruir tablas.

No se adopta `calc_hash` en v1; queda pospuesto salvo que una prueba demuestre valor material.

### 4. EVENT_ID / idempotencia

**DECISIÓN:** el LLM deja de ser autoridad para construir el identificador idempotente de eventos automáticos.

El backend debe construir una clave semántica estable basada en hechos canónicos.

**Corrección a Gemini:** NO usar `timestamp_aproximado` como componente esencial de la clave, porque un timestamp variable destruye idempotencia por hecho.

Diseño v1:
- `idempotency_key` estable, construida en backend;
- `event_id` puede derivarse de esa clave;
- componentes concretos se fijarán por tipo de evento.

Para T03: usar identificadores canónicos del caso/ciclo, no texto libre ni tiempo aproximado.

### 5. confirmed_by_consultant

Gemini propone renombrarlo a `llm_asserts_confirmed=true`.

**DECISIÓN:** rechazado.

Eso describiría correctamente que el LLM afirma algo, pero no añade garantía y normaliza una frontera de confianza débil.

Diseño objetivo:
- eventos automáticos T03 usan `authorization_basis = NORMA_AUTOMATICA` derivado por backend de una transición válida;
- eventos manuales que exijan confirmación usan referencia verificable de autorización/confirmación cuando aplique;
- API key acredita al cliente técnico, NO la autorización de negocio de cada evento.

El campo actual puede mantenerse temporalmente por compatibilidad mientras se introduce el contrato nuevo.

### 6. COM automático desde T03

**DECISIÓN:** aceptado como objetivo, pero no en el primer commit del motor.

Secuencia:
1. T03 determinista en modo shadow/comparación.
2. pruebas de cálculo y clasificación.
3. integración del productor COM.
4. prueba de exactamente-un-evento.
5. activación automática.

Razón: separar el cambio matemático del efecto lateral reduce riesgo y facilita rollback.

### 7. Fuentes / provenance

**DECISIÓN:** aceptar metadata mínima, sin exponer detalles físicos innecesarios.

Campos v1 propuestos:
- `data_status`
- `data_as_of`
- `fallback_used`
- `fallback_reason`
- `source_class`
- `policy_version`

No exponer IDs/rutas físicas al usuario operativo.

**Corrección:** no asumir que la selección física de fuente está hoy en el LLM. Debe inspeccionarse el Web App antes de rediseñar esa política.

### 8. T02

Claude propuso una máquina de seis estados; Gemini propone relectura simple.

**DECISIÓN:** término medio mínimo. No construir workflow engine de seis estados en v1, pero tampoco depender sólo de conversación.

Modelo mínimo persistible:
- `EVIDENCIA_CONFIRMADA`
- `DISCREPANCIA_PENDIENTE`
- `RESUELTA_CON_EVIDENCIA`

Flujo:
declaración humana → registrar discrepancia → relectura controlada → mantener o reclasificar según evidencia.

Un override administrativo excepcional, si existe normativamente, será una ruta separada y auditable.

### 9. E2E

Gemini acierta en que otro LLM como usuario simulado no debe ser la única base del E2E.

Pero API tests directos no prueban la principal frontera problemática: la orquestación del agente.

**DECISIÓN:** tres capas:
1. componentes/API sin LLM;
2. E2E conversacional SCRIPTED/REPLAY contra el agente real, con mensajes fijos y captura de tool calls;
3. E2E humano real.

Un segundo LLM puede usarse sólo como fuzzing complementario, nunca como criterio primario de aprobación.

## Correcciones a afirmaciones de Gemini

1. La afirmación de que un token opaco es suficiente sólo es válida si la emisión verifica realmente los checks acreditados; un JWT firmado sobre una afirmación no verificada sigue siendo una afirmación firmada.
2. API key + token de prearranque NO son por sí solos prueba de autorización COM de negocio.
3. `timestamp_aproximado` no debe formar parte de una clave idempotente estable.
4. No se acepta fallback automático a cálculo LLM cuando falle T03 determinista.
5. Markdown terminado es útil, pero no debe ser la única representación: conservar salida estructurada.
6. API testing + E2E humano deja sin probar la orquestación conversacional reproducible; se añade replay/scripted E2E.
7. Referencias normativas o IDs de incidentes no verificados en la evidencia de esta ronda no se adoptan automáticamente.

## Estado final

Arquitectura mínima v1: CONGELADA A NIVEL DE DISEÑO.
Código de producción: SIN CAMBIOS.
Siguiente gate: contratos de aceptación y diseño de interfaces antes de implementar.
