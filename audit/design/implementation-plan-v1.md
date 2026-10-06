# Plan de implementación v1

Rama: `reengineering-v1-contracts-2026-10-06`

Estado actual: contratos y pruebas solamente. Sin cambios de producción.

## Fase 0 — contratos

Entregables:
- PREARRANQUE_CASTABOT-v1
- EJECUTAR_T03-v1
- COM-IDEMPOTENCY-T03-v1
- TEST_ACCEPTANCE_V1

Gate: revisión técnica satisfactoria.

## Fase 1 — infraestructura sin efectos

1. Implementar utilidades de token opaco.
2. Implementar adaptador de prearranque en modo shadow.
3. Añadir verificación de token a una ruta T03 nueva, no a herramientas actuales.
4. Añadir trazas técnicas minimizadas, sin secretos.

Feature flags:
- `PRESTART_V1_ENABLED=false`
- `T03_V1_ENABLED=false`
- `T03_COM_V1_ENABLED=false`

No modificar comportamiento operativo existente.

## Fase 2 — motor T03 puro

1. Implementar función pura de cálculo/selección.
2. Implementar renderer canónico.
3. Implementar `EJECUTAR_T03` sin COM.
4. Ejecutar B y C.
5. Comparar contra casos históricos conocidos.

No fallback a cálculo LLM si falla el motor.

## Fase 3 — idempotencia/productor COM

1. Generar `consulta_id` e `event_id` en backend.
2. Adaptar ENCOLAR_COM para que T03 automático no acepte ID libre.
3. Mantener compatibilidad con el Web App actual.
4. Ejecutar D en sandbox.
5. Activar COM real sólo después de verificación.

## Fase 4 — E2E

1. Harness scripted/replay con mensajes fijos.
2. Captura de tool calls, orden y resultados.
3. Campañas H/B/D según alcance.
4. Prueba humana real controlada.

## Fase 5 — siguientes controles

Después del piloto:
- metadata de fuente/frescura;
- T02 discrepancia mínima;
- extensión del gate a T01/T02;
- retirada de lógica duplicada del prompt.

## Rollback

Rollback siempre por despliegue/feature flag.

Prohibido:
- "si falla backend, que el LLM calcule";
- aceptar un token no verificable;
- declarar COM enviado por haber encolado;
- usar un EVENT_ID libre del LLM en T03 automático.

## Definition of Done del piloto

El piloto T03 sólo se considera completo cuando:
1. cálculo y render deterministas pasan tests;
2. gate impide bypass;
3. retry no duplica COM;
4. envío sólo se declara con evidencia terminal;
5. E2E scripted pasa;
6. prueba humana real pasa;
7. no hay regresión material en la ruta existente.
