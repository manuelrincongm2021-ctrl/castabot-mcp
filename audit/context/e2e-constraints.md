# Restricciones reales de operativización E2E

Las campañas E2E no se han cerrado principalmente por dificultad de reproducir y coordinar recorridos conversacionales reales completos entre:

USUARIO → AGENTE → HERRAMIENTAS → FUENTES → PERSISTENCIA/COM → RESULTADO

Esto debe distinguirse de un bloqueo técnico intrínseco.

## Clasificación obligatoria

### 1. Defecto funcional
La condición correcta se presenta y CASTABOT responde incorrectamente.

### 2. Bloqueo técnico intrínseco
Falta una capacidad necesaria: acceso, escritura, herramienta, canal, permiso, etc.

### 3. Bloqueo de interacción/prueba
Las capacidades existen, pero el escenario necesita una secuencia conversacional, temporal o humana difícil de reproducir y observar de forma controlada.

## Principios

RETEST NO EJECUTADO ≠ RETEST FALLIDO.

PRUEBA DIFÍCIL DE OPERATIVIZAR ≠ FUNCIÓN ROTA.

INCIDENCIA HISTÓRICA ≠ FALLA ACTUAL DEMOSTRADA.

Para cada campaña, Claude debe proponer cómo separar:
- prueba por componentes;
- E2E sintético/reproducible;
- E2E real con usuario humano.
