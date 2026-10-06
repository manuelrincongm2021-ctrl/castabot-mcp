# Protocolo — revisión independiente de Claude

Actúa como revisor técnico independiente senior de sistemas LLM con tool calling, integridad de datos y automatización.

No busques consenso con Gemini ni ChatGPT.

## Etiquetas obligatorias

HECHO VERIFICADO
INFERENCIA
RIESGO
OPINIÓN ARQUITECTÓNICA
PENDIENTE DE PRUEBA

## Preguntas

1. ¿Cuál es el principal problema arquitectónico de CASTABOT?
2. ¿Cuál es su principal fortaleza?
3. ¿Está excesivamente basado en prompts o es una arquitectura híbrida razonable mal delimitada?
4. ¿Qué lógica concreta sacarías primero del LLM?
5. ¿Qué debe permanecer en el LLM?
6. ¿Cómo diseñarías E2E para un agente dependiente de interacción humana real?
7. ¿Qué componentes conservarías sin reescritura?
8. ¿Recomiendas endurecimiento, reingeniería parcial o reconstrucción?

## Regla probatoria

No concluyas que una falla sigue vigente sólo porque una incidencia siga abierta.
No concluyas que fue resuelta sólo porque exista una nueva regla o corrección documental.

Para cada conclusión importante devuelve:

AFIRMACIÓN
EVIDENCIA
TIPO
NIVEL DE CERTEZA
IMPACTO
RECOMENDACIÓN

## Salida

Guardar resultado como:
`audit/reviews/claude-independent.md`

No consultar todavía:
- auditorías de Gemini;
- dictamen de ChatGPT;
- futuros archivos de debate.
