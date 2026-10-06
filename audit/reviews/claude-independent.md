# Dictamen independiente de Claude — CASTABOT (ronda 1)

Fuente: dictamen entregado por Claude y recibido por el administrador el 06/10/2026.

## Alcance declarado por Claude

Claude indicó que no pudo inspeccionar el código ni las fuentes operativas directamente en su primera ronda. Por ello clasificó muchas conclusiones como inferencias, riesgos u opiniones arquitectónicas.

## Síntesis

- Recomienda reingeniería parcial, no reconstrucción.
- Identifica como principal problema que garantías críticas están expresadas como reglas, pero no necesariamente impuestas por mecanismos.
- Propone sacar del LLM: prearranque, cálculo T01/T03, selección de fuente/fallback, render canónico, clasificación T02, decisión de escalamiento y generación COM.
- Propone conservar en el LLM: interpretación de intención, conversación, aclaraciones y explicación.
- Distingue correctamente bloqueo técnico de bloqueo de interacción/prueba.
- Propone E2E en tres niveles: componentes, E2E sintético repetible y E2E real humano.

## Observaciones posteriores de contraste con código

Tras recibir el dictamen, ChatGPT contrastó puntos clave con `src/index.ts`:

1. `castabot-mcp` expone actualmente `CONSULTAR_DATOS_CASTABOT` y `ENCOLAR_COM`.
2. `CONSULTAR_DATOS_CASTABOT` devuelve filas estructuradas de datasets PENSION/BASCULA/REPORTES_BASCULA; no implementa en este repositorio el cálculo completo T01/T02/T03.
3. La regla T03 de variación >1.50 % y disparo COM aparece en las instrucciones del servidor, no como función de cálculo determinista en este código.
4. `ENCOLAR_COM` exige `event_id`, valida esquema y delega al Web App oficial; el contrato declara idempotencia y admite respuesta de duplicado.
5. El código no implementa un hard gate de prearranque a nivel de herramienta/sesión.
6. El campo `confirmed_by_consultant` debe ser `SI`, pero el servidor acepta que ese SI represente autorización humana o normativa automática; la comprobación material de esa autorización no se realiza en esta capa.

Estos puntos fortalecen el diagnóstico de frontera LLM/código mal delimitada y justifican una segunda ronda enfocada en mecanismos deterministas y pruebas.

## Próxima ronda sugerida

- inspección dirigida de `src/index.ts` por Claude;
- especificación de contratos deterministas T03 primero;
- diseño de harness E2E sintético para H/B/D;
- separar verificación del productor COM de transporte COM;
- instrumentar prearranque como estado verificable por herramientas.
