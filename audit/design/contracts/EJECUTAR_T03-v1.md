# EJECUTAR_T03 v1 — contrato determinista

Estado: DISEÑO EJECUTABLE. No desplegado.

## Objeto

Mover a backend la parte determinista de T03 sin retirar al LLM su función semántica/conversacional.

El LLM:
- detecta intención;
- normaliza la solicitud a campos de entrada;
- pide datos faltantes;
- muestra el bloque canónico;
- explica en lenguaje natural si hace falta.

El backend:
- valida prearranque;
- consulta datos vigentes;
- selecciona históricos comparables;
- calcula;
- clasifica;
- construye presentación canónica;
- prepara la identidad idempotente de la consulta.

## Entrada

```json
{
  "prestart_token": "<opaque>",
  "identifier_type": "NUMERO_ECONOMICO | MATRICULA",
  "identifier_value": "string",
  "weight_type": "BRUTO | TARA",
  "current_weight_kg": 0
}
```

La entrada debe coincidir exactamente con el contexto sellado en el token.

Los históricos NO son entrada del LLM.

## Fuente

La herramienta resuelve internamente la fuente operativa correspondiente. No acepta del LLM un A1 range ni una fuente física.

Prioridad lógica:
1. vía operativa primaria autorizada;
2. fuente original autorizada;
3. fallback autorizado sólo si la primaria/original no están disponibles;
4. si no existe fuente válida: fail closed.

No mezclar versiones de fuente en un mismo informe.

## Identificación

La unidad se busca por la clave proporcionada:
- NÚMERO ECONÓMICO, o
- MATRÍCULA.

Cuando sea necesario evitar coincidencias incorrectas, el backend valida identificadores alternos y metadatos comparables disponibles.

## Peso analizado

La decisión T03 utiliza exclusivamente el mismo tipo de peso solicitado:
- BRUTO → históricos BRUTO;
- TARA → históricos TARA.

No mezclar BRUTO/TARA/NETO para el promedio analizado.
No estimar un tipo de peso desde otros tipos.

## Comparabilidad

Exclusiones deterministas mínimas:
- valor 0;
- valor ausente;
- registro incompleto para el peso analizado;
- unidad no coincidente;
- tipo de peso no coincidente;
- registro marcado de forma objetiva como no comparable por la fuente/regla.

Los casos "evidentemente anómalos" que no puedan decidirse mediante una regla codificada NO se excluyen por heurística inventada. Se devuelven como:
`REVIEW_REQUIRED`
y el cálculo final queda bloqueado hasta resolver la comparabilidad.

Nunca excluir silenciosamente.

## Cálculo

Para el peso solicitado:

```
PROMEDIO = SUM(pesos válidos) / COUNT(pesos válidos)
DIFERENCIA = PESO_ACTUAL - PROMEDIO
VARIACION = (DIFERENCIA / PROMEDIO) * 100
```

La precisión interna se conserva durante todo el cálculo.

Presentación:
- promedio: kg entero más cercano;
- variación: 2 decimales.

La comparación de umbral utiliza la precisión interna, NO la variación redondeada para mostrar.

### Umbral

```
ABS(VARIACION) <= 1.50  => APROBADO_PARA_PESAR
ABS(VARIACION) >  1.50  => CONSULTAR_ADMINISTRADOR
```

Exactamente 1.50 % está dentro de rango.

## Tabla canónica

Siempre diez columnas y exactamente este orden:

1. FOLIO
2. FECHA DE ENTRADA
3. MATRÍCULA
4. NÚMERO ECONÓMICO
5. CLIENTE
6. OPERADOR
7. PESO BRUTO
8. % VARIACIÓN PESO BRUTO VS PROMEDIO BRUTO
9. PESO TARA
10. % VARIACIÓN PESO TARA VS PROMEDIO TARA

PESO NETO está prohibido.

Dato canónico ausente → `—`.
Columna ausente → error de render.

Las variaciones por fila son descriptivas y no cambian selección, promedio ni decisión.

## Salida estructurada

```json
{
  "ok": true,
  "consulta_id": "string",
  "idempotency_key": "string",
  "unit": {
    "identifier_type": "NUMERO_ECONOMICO",
    "identifier_value": "..."
  },
  "analysis": {
    "weight_type": "BRUTO",
    "current_weight_kg": 0,
    "historical_average_internal": 0,
    "historical_average_display_kg": 0,
    "difference_kg": 0,
    "variation_percent_internal": 0,
    "variation_percent_display": "0.00",
    "threshold_percent": 1.50,
    "status": "DENTRO_DE_RANGO | FUERA_DE_RANGO",
    "decision": "APROBADO_PARA_PESAR | CONSULTAR_ADMINISTRADOR"
  },
  "history": {
    "valid": [],
    "excluded": [],
    "review_required": []
  },
  "data": {
    "data_status": "VIGENTE | DEGRADADO",
    "data_as_of": "ISO-8601 | null",
    "fallback_used": false,
    "fallback_reason": null,
    "source_class": "PRIMARY | ORIGINAL | AUTHORIZED_FALLBACK",
    "policy_version": "source-v1"
  },
  "com_policy": {
    "operational_event_required": true,
    "out_of_range_escalation_required": false,
    "authorization_basis": ["T03_OPERATIONAL_AUTO"]
  },
  "canonical_markdown": "..."
}
```

### Reconciliación de COM T03

La normativa vigente contiene dos obligaciones compatibles:

1. cada T03 canónico completado genera un evento operativo T03;
2. cuando ABS(VARIACIÓN) > 1.50 %, existe además obligación específica de escalamiento automático a Administración.

V1 las representa con **un solo evento por consulta**, no dos:
- dentro de rango: evento T03 operativo, `out_of_range_escalation_required=false`;
- fuera de rango: el mismo evento lleva además `out_of_range_escalation_required=true` y base de autorización específica.

Así se conserva trazabilidad T03 y se evita duplicación COM por una misma consulta.

## canonical_markdown

Debe generarlo el backend desde la estructura, no el LLM.

Orden:
1. encabezado;
2. identificación compacta;
3. tabla de diez columnas;
4. exactamente cuatro líneas de resumen:
   - 📊 PESO HISTÓRICO
   - ⚖️ PESO ACTUAL
   - ↕️ DIFERENCIA
   - 📈 VARIACIÓN
5. observación objetiva breve;
6. última línea operativa exacta:
   - **🟢 APROBADO PARA PESAR.**
   - o **🔴 CONSULTAR CON ADMINISTRADOR ANTES DE PESAR.**

No añadir texto operativo después del semáforo dentro del bloque canónico.

## Ausencia de históricos

Si no existe ningún histórico válido:
```
ok = false
code = "NO_VALID_HISTORY"
```

No inventar promedio, no usar 0 como promedio, no reutilizar promedio anterior.

Si la causa es falta de fuente:
`DATA_UNAVAILABLE`, no `NO_VALID_HISTORY`.

## Ambigüedad de comparabilidad

Si existe al menos un registro cuya inclusión/exclusión depende de una regla no codificada:
```
ok = false
code = "HISTORY_REVIEW_REQUIRED"
review_required = [...]
```

No decidir por una heurística nueva.

## Invariante

Mismo token válido + misma entrada + mismo snapshot de datos + misma versión de regla ⇒ mismo resultado estructurado y mismo Markdown canónico.
