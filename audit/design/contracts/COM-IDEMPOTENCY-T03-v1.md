# COM idempotente T03 v1 — contrato

Estado: DISEÑO EJECUTABLE. No desplegado.

## Objetivo

Garantizar idempotencia por consulta/hecho y no sólo por un EVENT_ID libre producido por el LLM.

## Autoridad

Para eventos T03 automáticos:
- el LLM NO construye `event_id`;
- el LLM NO establece `confirmed_by_consultant`;
- el backend deriva autorización e identidad del evento desde el resultado T03 acreditado.

## Identidad de consulta

`PREARRANQUE_CASTABOT` genera un `jti` sellado y liga el token al digest de la operación.

`EJECUTAR_T03` deriva:

```
consulta_id = HMAC(server_idempotency_secret,
                   "T03|v1|" + prestart_jti + "|" + task_context_digest)
```

La implementación puede usar otro formato criptográfico equivalente.

Propiedades:
- mismo token + mismo contexto ⇒ misma consulta_id;
- token distinto ⇒ consulta distinta;
- no depende de texto libre;
- no depende de timestamp aproximado;
- no depende de redondeo de presentación.

## EVENT_ID

```
event_id = "T03-" + stable_encoding(consulta_id)
```

El Web App existente mantiene su deduplicación por EVENT_ID.

`event_id` se deriva del `consulta_id`; no es input del LLM para T03.

## Un solo evento por consulta T03

Cada consulta canónica T03 produce a lo sumo un evento operativo COM.

Payload lógico:

```json
{
  "event_id": "T03-...",
  "consulta_id": "...",
  "origin": "T03",
  "classification": "DENTRO_DE_RANGO | FUERA_DE_RANGO",
  "escalation": false,
  "authorization_basis": ["T03_OPERATIONAL_AUTO"],
  "payload": {
    "identifier": "...",
    "weight_type": "BRUTO | TARA",
    "current_weight_kg": 0,
    "historical_average_kg": 0,
    "difference_kg": 0,
    "variation_percent": 0,
    "decision": "..."
  }
}
```

Fuera de rango:
```
escalation = true
authorization_basis += "T03_OUT_OF_RANGE_AUTO"
```

No crear un segundo evento sólo por el escalamiento.

## Compatibilidad temporal con ENCOLAR_COM actual

Mientras el Web App requiera `confirmed_by_consultant="SI"`:
- el adaptador backend podrá rellenarlo internamente únicamente después de establecer una `authorization_basis` válida;
- el campo no será visible como decisión libre del LLM.

Este campo queda marcado **DEPRECATED** para T03 automático.

## Estados

```
GENERADO
ENCOLADO
ENVIANDO
ENVIADO
FALLIDO
```

Un resultado T03 puede existir aunque COM todavía no esté acreditado.

Declaración de entrega:
```
ENVIADO <=> status == "ENVIADO"
           AND telegram_message_id is present
```

Nada anterior permite declarar envío.

## Retry

Reintento de la misma consulta con mismo token/contexto:
- misma `consulta_id`;
- mismo `event_id`;
- el Web App devuelve evento existente;
- cero filas/eventos adicionales.

No regenerar prearranque automáticamente durante un retry técnico de la misma operación, porque un token nuevo representa una consulta lógica nueva.

## Fallo COM

Si cálculo T03 es correcto pero COM no puede acreditarse:
- conservar resultado T03;
- no decir que se envió;
- aplicar el mecanismo de incidencia/reintento autorizado;
- nunca recalcular con LLM para "resolver" el fallo.

## Postregistro

El postregistro administrativo T03 sólo puede ocurrir después de COM acreditado cuando así lo exige el flujo vigente y debe usar el mismo `consulta_id/event_id` para idempotencia.
