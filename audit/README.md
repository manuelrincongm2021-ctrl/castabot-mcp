# CASTABOT — auditoría multimodelo

Baseline de revisión: rama `audit-multimodel-2026-10-06`.

Objetivo: permitir que Claude, ChatGPT y Gemini evalúen la misma evidencia sin mezclar prematuramente sus conclusiones.

## Reglas de trabajo

1. No tratar auditorías previas como verdad.
2. Distinguir HECHO VERIFICADO / INFERENCIA / RIESGO / OPINIÓN / PENDIENTE DE PRUEBA.
3. RETEST NO EJECUTADO ≠ RETEST FALLIDO.
4. INCIDENCIA ABIERTA ≠ FALLA ACTUAL DEMOSTRADA.
5. CORRECCIÓN DOCUMENTAL ≠ RESOLUCIÓN FUNCIONAL.
6. OPERACIÓN REAL EXITOSA ≠ CAMPAÑA E2E FORMALMENTE APROBADA.
7. No cerrar desacuerdos por votación entre modelos: convertirlos en pruebas.

## Primera ronda

Claude debe leer primero:
- `audit/context/baseline.md`
- `audit/context/e2e-constraints.md`
- `audit/protocol/claude-independent-review.md`
- `audit/tests/H-prearranque.md`
- `audit/tests/B-autoridad-evidencia.md`
- `audit/tests/D-t03-chat-nuevo-com.md`

Después debe escribir su dictamen independiente sin leer todavía las auditorías de Gemini ni conclusiones de ChatGPT.
