# CLAUDE — START HERE: CASTABOT MULTIMODEL REVIEW

## Propósito

Realizar una revisión técnica independiente de CASTABOT usando el material de la carpeta `audit/`.

Esta primera ronda debe ser independiente. No adoptes conclusiones de Gemini ni ChatGPT como verdad.

## Lee en este orden

1. `audit/context/baseline.md`
2. `audit/context/e2e-constraints.md`
3. `audit/protocol/claude-independent-review.md`
4. `audit/tests/H-prearranque.md`
5. `audit/tests/B-autoridad-evidencia.md`
6. `audit/tests/D-t03-chat-nuevo-com.md`

Puedes inspeccionar el código del repositorio cuando necesites verificar una afirmación arquitectónica.

## Regla probatoria

Distingue siempre:

- HECHO VERIFICADO
- INFERENCIA
- RIESGO
- OPINIÓN ARQUITECTÓNICA
- PENDIENTE DE PRUEBA

Y conserva estas distinciones:

- RETEST NO EJECUTADO != RETEST FALLIDO
- INCIDENCIA ABIERTA != FALLA ACTUAL DEMOSTRADA
- CORRECCIÓN DOCUMENTAL != RESOLUCIÓN FUNCIONAL
- OPERACIÓN REAL EXITOSA != CAMPAÑA E2E APROBADA

## Punto clave sobre las pruebas E2E

Parte de las campañas siguen abiertas por dificultades para reproducir una interacción completa:

USUARIO -> AGENTE -> HERRAMIENTAS -> FUENTES -> PERSISTENCIA/COM -> RESULTADO

No presupongas que una prueba no cerrada implica un bloqueo técnico intrínseco.

Para cada prueba separa:
1. defecto funcional;
2. bloqueo técnico;
3. bloqueo de interacción/prueba.

## Preguntas obligatorias

1. ¿Cuál es el principal problema arquitectónico de CASTABOT?
2. ¿Cuál es su principal fortaleza?
3. ¿Está excesivamente basado en prompts o es una arquitectura híbrida razonable pero mal delimitada?
4. ¿Qué lógica sacarías primero del LLM?
5. ¿Qué debe permanecer dentro del LLM?
6. ¿Cómo diseñarías E2E reproducibles para un agente dependiente de interacción humana?
7. ¿Qué componentes conservarías sin reescritura?
8. ¿Recomiendas endurecimiento, reingeniería parcial o reconstrucción?

## Formato de salida

Para cada conclusión importante usa:

AFIRMACIÓN:
EVIDENCIA:
TIPO:
NIVEL DE CERTEZA:
IMPACTO:
RECOMENDACIÓN:

Al final incluye:
- dictamen arquitectónico;
- mejoras propuestas a H, B y D;
- lista de afirmaciones del baseline que no pudiste demostrar;
- propuesta de siguiente ronda de pruebas.

No modifiques código operativo.
