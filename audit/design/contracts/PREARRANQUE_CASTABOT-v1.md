# PREARRANQUE_CASTABOT v1 — contrato

Estado: DISEÑO EJECUTABLE. No desplegado.

## Objetivo

Convertir el prearranque de una obligación conductual en una precondición verificable por backend, sin introducir una sesión persistida general.

La primera implementación se limita al piloto T03. El patrón podrá extenderse después a T01/T02.

## Decisión de arquitectura

Se utilizará un **token opaco, autenticado y de corta duración**, emitido únicamente después de que el backend haya ejecutado los checks que el token acredita.

El token:
- no es una credencial de autenticación de usuario;
- no prueba identidad humana salvo que la identidad se haya verificado realmente;
- no puede construirse ni marcarse como válido desde el LLM;
- queda ligado a una tarea y a un contexto de operación concreto;
- puede reutilizarse únicamente para reintentos de la misma operación mientras sea válido.

No se implementará `session_state` persistente en v1.

## Operación propuesta

`PREARRANQUE_CASTABOT`

### Entrada

```json
{
  "mode": "OPERATIVO",
  "task": "T03",
  "task_context": {
    "identifier_type": "NUMERO_ECONOMICO | MATRICULA",
    "identifier_value": "string",
    "weight_type": "BRUTO | TARA",
    "current_weight_kg": 0
  }
}
```

En v1, `task=T03` es el único alcance ejecutable. Otros valores deberán devolver `NOT_IMPLEMENTED_FOR_TASK`.

### Checks obligatorios para emitir token T03

1. La fuente normativa vigente fue consultada por una vía de backend autorizada y se obtuvo una revisión/versión actual.
2. La regla T03 aplicable quedó identificada.
3. La ruta de datos operativa quedó determinada conforme a prioridad vigente.
4. La ruta de datos no está en estado `NO_DISPONIBLE`.
5. El contexto mínimo T03 está completo y tipado.
6. No se reutiliza un resultado anterior como dato actual.
7. El token queda ligado al digest canónico de `task_context`.

Si cualquiera falla, no se emite token.

### Salida satisfactoria

```json
{
  "ok": true,
  "prestart_token": "<opaque>",
  "scope": {
    "mode": "OPERATIVO",
    "task": "T03"
  },
  "expires_at": "ISO-8601",
  "checks": [
    {"name":"NORM_CURRENT","passed":true},
    {"name":"RULE_T03_RESOLVED","passed":true},
    {"name":"DATA_ROUTE_RESOLVED","passed":true},
    {"name":"INPUT_COMPLETE","passed":true}
  ],
  "data_status": "VIGENTE | DEGRADADO",
  "contract_version": "prestart-v1"
}
```

No se exponen al consultante rutas, IDs de documentos, secretos ni nombres físicos internos.

### Salida de bloqueo

```json
{
  "ok": false,
  "code": "NORM_UNAVAILABLE | DATA_ROUTE_UNAVAILABLE | INPUT_INCOMPLETE | TASK_NOT_ALLOWED | NOT_IMPLEMENTED_FOR_TASK",
  "blocking_check": "string",
  "missing_inputs": []
}
```

No se devuelve cálculo parcial.

## Claims internos sellados

El token opaco debe contener o referenciar de forma autenticada:

- `jti` aleatorio generado por backend;
- `task=T03`;
- `mode`;
- `task_context_digest`;
- `norm_revision_tag`;
- `rule_contract_version`;
- `data_route_class`;
- `issued_at`;
- `expires_at`.

El formato concreto puede ser JWE/PASETO-local u otro token autenticado opaco. No usar un booleano libre aportado por el LLM.

TTL debe ser configurable por servidor. Valor inicial recomendado para pruebas: 10 minutos.

## Binding de operación

`task_context_digest` se calcula sobre una representación canónica de:

```
identifier_type
identifier_value normalizado
weight_type
current_weight_kg normalizado
```

`EJECUTAR_T03` debe recalcular ese digest y rechazar el token si no coincide.

Esto convierte el token en un gate de **una operación lógica** y evita que un prearranque de T03 habilite otra consulta distinta.

## Relación con identidad

V1 no debe afirmar identidad autenticada si la plataforma no aporta un principal verificable.

Si existe identidad declarada pero no autenticada:
```
identity_assurance = "DECLARED"
```

Si existe verificación real por backend:
```
identity_assurance = "VERIFIED"
```

No mezclar ambas.

## Códigos de rechazo en herramientas protegidas

- `PRESTART_REQUIRED`
- `PRESTART_INVALID`
- `PRESTART_EXPIRED`
- `PRESTART_SCOPE_MISMATCH`
- `PRESTART_CONTEXT_MISMATCH`

## Invariante

**Sin token válido y coincidente no existe resultado T03.**

Una herramienta protegida no podrá devolver promedio, variación, semáforo ni producir COM si el gate no está acreditado.

## Rollback

El rollback es de despliegue/feature flag, nunca un fallback automático a cálculo LLM.

Si la herramienta protegida no está disponible:
- se revierte el despliegue durante desarrollo, o
- se informa indisponibilidad operativa conforme a la política vigente.

No se restaura silenciosamente la garantía al prompt.
