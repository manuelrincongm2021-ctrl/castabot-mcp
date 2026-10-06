# Web App — VERIFICAR_PREARRANQUE_T03 v1

Estado: PARCHE PREPARADO, NO DESPLEGADO.

## Problema resuelto

Un token firmado por MCP no prueba prearranque si se emite basándose en una afirmación del LLM.

La emisión debe depender de una verificación backend que **lea efectivamente** la fuente normativa vigente y resuelva la ruta de datos T03.

## Acción Web App

`VERIFICAR_PREARRANQUE_T03`

Entrada:
- mode OPERATIVO;
- task T03;
- identifier_type;
- identifier_value;
- weight_type;
- current_weight_kg.

La acción:
1. carga el documento normativo configurado mediante Script Property privada;
2. lee el texto actual;
3. verifica marcadores materiales T03/prearranque;
4. calcula digest SHA-256 de la norma efectivamente leída;
5. comprueba acceso al spreadsheet REPORTES_BASCULA;
6. valida entradas;
7. devuelve acreditación estructurada.

## Separación de responsabilidades

Web App:
- acredita lectura normativa y ruta de datos.

MCP:
- valida la respuesta del Web App;
- compara el contexto verificado contra el solicitado;
- sólo entonces emite token opaco autenticado.

LLM:
- puede transportar el token;
- no puede fabricarlo;
- no puede elegir `prestart_verified=true`.

## Configuración

El ID de la fuente normativa no debe almacenarse en el repositorio público.

Se configura en Apps Script mediante:
`CASTABOT_NORM_DOCUMENT_ID`.

## Código preparado

- `apps-script/prestart_t03.gs`
- `src/prestart/backend.ts`

## Gate de despliegue

No exponer `PREARRANQUE_CASTABOT` hasta:
- incorporar parche al Apps Script real;
- configurar Script Property;
- integrar dispatch doPost;
- redeplegar;
- probar que una lectura normativa real produce digest;
- probar que falta de norma o ruta de datos impide emitir token.

ARCHIVO PREPARADO ≠ PREARRANQUE FUNCIONAL DESPLEGADO.
