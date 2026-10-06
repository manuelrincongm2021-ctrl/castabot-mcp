# Restricciones de pruebas E2E

Las campañas E2E siguen abiertas en parte porque reproducir una secuencia conversacional completa exige coordinar usuario, agente, herramientas, fuentes y efectos posteriores.

Distinguir:
1. Defecto funcional: la condición correcta se presenta y el sistema responde incorrectamente.
2. Bloqueo técnico: falta una capacidad necesaria.
3. Bloqueo de interacción o prueba: las capacidades existen, pero el escenario completo es difícil de reproducir y observar de manera controlada.

Principios:
- Retest no ejecutado no equivale a retest fallido.
- Incidencia abierta no equivale a falla actual demostrada.
- Corrección documental no equivale a resolución funcional.
- Operación exitosa aislada no equivale a campaña E2E aprobada.

Para cada campaña proponer:
- prueba por componentes;
- E2E sintético;
- E2E real.
