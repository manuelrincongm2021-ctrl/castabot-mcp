# Arquitectura mínima v1 — CASTABOT

Fecha: 2026-10-06
Estado: DISEÑO CONGELADO — PENDIENTE DE PRUEBAS/IMPLEMENTACIÓN

## Objetivo

Reducir dependencia del LLM en garantías críticas sin reconstruir CASTABOT ni introducir infraestructura innecesaria.

## Cambio 1 — PREARRANQUE_CASTABOT

Nueva operación controlada que ejecuta checks de prearranque y emite un token opaco firmado de corta duración.

El token debe contener o referenciar al menos:
- scope/mode;
- tarea o familia autorizada;
- versión del contrato de prearranque;
- instante de emisión;
- expiración.

No debe afirmar identidad/rol salvo que esos datos hayan sido realmente verificados por backend.

Las herramientas críticas nuevas exigirán token válido.

## Cambio 2 — EJECUTAR_T03

Herramienta determinista.

Entrada mínima orientativa:
- token de prearranque;
- unidad económica/canónica;
- tipo de peso;
- peso actual;
- contexto mínimo necesario.

La herramienta obtiene históricos por backend en vez de confiar en históricos aportados por el LLM.

Salida:
- datos usados;
- históricos válidos/excluidos;
- promedio;
- diferencia;
- variación;
- regla/umbral;
- estado;
- decisión;
- `com_required`;
- `canonical_markdown`;
- metadata de datos/fuente.

El LLM no recalcula.

## Cambio 3 — Productor COM por hecho

Para eventos automáticos:
- backend construye `idempotency_key`;
- `event_id` deriva de hechos canónicos;
- el LLM no provee identificador libre;
- autorización automática se representa con base normativa estructurada.

La integración T03→COM se activa después de probar T03 sin efectos laterales.

## Cambio 4 — Metadata de datos

Ampliar lecturas con:
- `data_status`;
- `data_as_of`;
- `fallback_used`;
- `fallback_reason`;
- `source_class`;
- `policy_version`.

Primera fase en modo observación. Política de bloqueo por tarea se define después de medir y de inspeccionar el Web App.

## Cambio 5 — T02 evidencia mínima

No implementar motor genérico de workflow.

Persistir sólo:
- evidencia actual;
- discrepancia pendiente;
- resolución por evidencia.

Una declaración humana puede abrir discrepancia, nunca reclasificar por sí sola.

## Estrategia de pruebas

Nivel 1 — componentes/API
- cálculo T03;
- límites 1.50%;
- ID idempotente;
- token inválido/expirado;
- metadata de fuente;
- T02 relectura.

Nivel 2 — E2E scripted/replay
- mensajes fijos contra agente real;
- captura de orden de tool calls;
- prueba H prearranque;
- prueba B autoridad de evidencia;
- prueba D T03+COM.

Nivel 3 — humano real
- escenarios seleccionados de campañas oficiales;
- evidencia persistida;
- verificación terminal real.

## Orden de implementación propuesto

1. Contratos + pruebas unitarias del event key y T03, sin efectos.
2. `PREARRANQUE_CASTABOT` en shadow y validación de token.
3. `EJECUTAR_T03` en shadow, comparando con resultados históricos.
4. Integrar T03 → COM con idempotencia por hecho y pruebas scripted.
5. Añadir metadata de fuentes y T02 mínimo; luego activar gates/bloqueos según evidencia.

## Lo que NO se reescribe

- COM-S;
- cola y procesamiento actuales;
- Telegram;
- MCP/API como canal;
- Google Sheets/Drive como fuentes;
- workflows existentes, salvo ajustes de validación;
- LLM como interfaz semántica;
- normativa como especificación de negocio.
