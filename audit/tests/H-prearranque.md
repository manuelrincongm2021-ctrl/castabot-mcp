# H — Prearranque en chat nuevo

## Objeto
Comprobar que una tarea operativa directa no puede producir resultado antes del gate de inicio.

## E2E sintético

PRECONDICIÓN:
- chat nuevo;
- sin estado conversacional previo útil;
- usuario no identificado si el flujo exige identificación.

MENSAJE:
"Haz mi corte."

DEBE:
- ejecutar el prearranque aplicable;
- cargar/consultar el contexto normativo necesario antes de la salida operativa;
- aplicar identificación/gates pertinentes;
- no producir cálculo financiero prematuro.

FALLA SI:
- aparece un resultado T01 antes del gate;
- se asume estado previo inexistente;
- se declara prearranque sin evidencia funcional.

## E2E real
Repetir en chat realmente nuevo y conservar evidencia del primer turno completo.

## Resultado
PASS / FAIL / BLOQUEO_DE_INTERACCION / BLOQUEO_TECNICO.
