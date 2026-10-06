# Web App — BUSCAR_T03_CASTABOT v1

Estado: PARCHE PREPARADO, NO DESPLEGADO.

## Hallazgo de fuente viva

REPORTES DE BASCULA 2026 contiene:
- PROGRAMA, encabezado fila 1;
- TRANSPORTES DAMIANO, encabezado fila 2;
- DAMIGAS, encabezado fila 2;
- CARTONERA GUADALUPANA, encabezado fila 2;
- FERNANDO BALLINAS, encabezado fila 2;
- HERRERAS, encabezado fila 2;
- MOISES ACOSTA, encabezado fila 2.

Los nombres de columnas no son uniformes entre pestañas:
- FOLIO / ID;
- No ECONOMICO / NO ECON / No. ECOCOM / NUM ECONOMICO;
- PESO BRUTO / P. BRUTO / BRUTO;
- PESO TARA / P. TARA / TARA;
- FECHA ENTRADA / FECHA DE ENTRADA / F ENTRADA.

Por esto el parser no debe asumir una sola posición fija global.

## Limitación del backend actual

`LEER_DATOS_CASTABOT` acepta dataset + rango A1 y ejecuta `getRange(...).getDisplayValues()`.

Eso es adecuado para lecturas acotadas, pero no para T03 por identificador: el llamador no conoce de antemano qué filas contienen la unidad.

Leer todas las pestañas completas en cada T03 se rechaza por costo, latencia y volumen.

## Acción nueva

`BUSCAR_T03_CASTABOT`

Entrada:
```json
{
  "accion": "BUSCAR_T03_CASTABOT",
  "identifier_type": "MATRICULA | NUMERO_ECONOMICO",
  "identifier_value": "..."
}
```

Salida:
- registros normalizados de todas las pestañas coincidentes;
- metadata de lectura;
- sin IDs físicos o secretos en la respuesta al modelo.

## Algoritmo

1. Abrir el spreadsheet REPORTES_BASCULA ya autorizado por el Web App.
2. Detectar fila de encabezado en primeras tres filas.
3. Resolver aliases de columnas.
4. Leer sólo la columna de identificación de cada pestaña.
5. Normalizar identificador removiendo espacios, guiones y puntuación.
6. Recuperar filas completas únicamente para coincidencias.
7. Normalizar campos.
8. Deduplicar registros replicados entre pestañas.
9. Devolver resultado estructurado.

## Seguridad

La acción no acepta spreadsheet ID, URL ni nombre de archivo del llamador.
La fuente está encapsulada por configuración de backend.

## Estado de despliegue

El parche fuente está en:
`apps-script/t03_search.gs`

No existe herramienta disponible en esta sesión para publicar directamente el proyecto Apps Script productivo.

**ARCHIVO PREPARADO ≠ WEB APP DESPLEGADO.**

No activar `EJECUTAR_T03` contra producción hasta que:
1. el parche se incorpore al proyecto Apps Script real;
2. se agregue el dispatch en `doPost`;
3. se redepliegue el Web App;
4. una prueba de lectura real acredite el nuevo contrato.
