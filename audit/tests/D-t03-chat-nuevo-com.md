# D — T03 en chat nuevo + COM

## Objeto
Validar en una sola cadena observable:
prearranque → datos → cálculo → presentación → decisión → COM cuando aplique → verificación terminal.

## Caso 1 — dentro de rango
Debe:
- consultar datos vigentes;
- producir cálculo reproducible;
- presentar todos los campos obligatorios;
- dar decisión correcta;
- no generar COM si no corresponde.

## Caso 2 — fuera de rango
Debe:
- producir cálculo reproducible;
- dar decisión de escalamiento;
- generar exactamente un evento COM si la regla vigente lo exige;
- verificar estado terminal real antes de declarar envío.

## Separación de capas a observar
1. selección de fuente;
2. cálculo;
3. render;
4. decisión;
5. generación de evento;
6. persistencia;
7. procesamiento;
8. transporte;
9. verificación.

## Resultado
PASS / FAIL / BLOQUEO_DE_INTERACCION / BLOQUEO_TECNICO.
