# Baseline técnica CASTABOT

## Estado general

CASTABOT es un agente conversacional operativo para tareas como T01 (corte), T02 (faltantes de Pensión), T03 (peso promedio), entrenamiento y comunicaciones COM.

La revisión debe asumir una arquitectura híbrida, no un sistema puramente basado en prompts:

- LLM: interpretación semántica, conducción conversacional y parte de la lógica operativa.
- Google Sheets/Drive: datos, persistencia, control administrativo y evidencias.
- castabot-mcp: integración propia, especialmente COM.
- COM-S: cola, procesamiento, idempotencia, verificación y transporte a Telegram.
- Normativa: especificación operativa y controles.

## Estado comprobado relevante al 06/10/2026

- Existen incidencias históricas y actuales que requieren retest funcional.
- El prearranque en chat nuevo tiene una incidencia bloqueante: la norma existe, pero no se ha demostrado todavía un hard gate funcional en todos los chats nuevos.
- Existen reincidencias documentadas de formato T03.
- Existe evidencia histórica de selección incorrecta de fallback local; sigue pendiente retest.
- COM-S muestra transporte operativo con numerosos eventos enviados y sin fallos activos en el panel consultado; aun así permanecen pendientes pruebas E2E del disparador desde tareas operativas.
- Las campañas A–J no están formalmente cerradas.
- El panel de campañas refleja 0 campañas aprobadas; esto no equivale a ausencia total de progreso técnico.

## Pregunta arquitectónica principal

Determinar si la frontera actual entre LLM y código determinista está correctamente delimitada.

No asumir que:
- toda lógica vive en prompts;
- todo backend es determinista;
- una regla escrita garantiza ejecución;
- una incidencia abierta prueba una falla actual;
- una ejecución exitosa aislada prueba ausencia del defecto.
