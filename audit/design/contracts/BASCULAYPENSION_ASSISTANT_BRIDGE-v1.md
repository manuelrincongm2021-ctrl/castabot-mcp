# BASCULAYPENSION Assistant Bridge v1

Estado: PREPARADO / NO ACTIVADO EN PRODUCCIÓN.

## Objetivo

Permitir que BASCULAYPENSION consuma capacidades de CASTABOT sin duplicar la lógica operativa del software ni otorgar a CASTABOT escritura directa sobre pension.db.

Principio:

- BASCULAYPENSION = sistema de registro operativo.
- CASTABOT = asistente de consulta, análisis y guía.
- El cliente se declara READ_ONLY.
- La conexión usa una credencial exclusiva del asistente.
- No se reutiliza CASTABOT_API_KEY ni COM_FAST_PATH_SECRET.

## Feature flag

`CASTABOT_ASSISTANT_BRIDGE_ENABLED=false` por defecto.

La activación requiere además:

`CASTABOT_ASSISTANT_API_KEY=<secreto exclusivo>`

## Endpoints v1

### POST /assistant/v1/handshake

Autenticación:

`Authorization: Bearer <CASTABOT_ASSISTANT_API_KEY>`

Entrada mínima:

```json
{
  "app": "BASCULAYPENSION",
  "app_version": "1.0.0",
  "installation_id": "LENOVO-BASCULA-01",
  "mode": "READ_ONLY",
  "requested_capabilities": ["HEALTH_V1", "CONTEXT_V1", "T03_V1"]
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "bridge": "CASTABOT_BASCULAYPENSION",
  "bridge_version": "1.0.0",
  "mode": "READ_ONLY",
  "accepted_capabilities": ["HEALTH_V1", "CONTEXT_V1", "T03_V1"],
  "t03_enabled": true
}
```

El servidor no persiste el handshake ni lo trata como operación.

### POST /assistant/v1/context/validate

Valida el contexto enviado por BASCULAYPENSION y devuelve el contexto normalizado con `persisted=false`. Sirve para probar integración contextual sin modelo conversacional y sin escritura.

### POST /assistant/v1/t03/prearranque

Reutiliza exactamente el motor determinista T03 existente. No crea una segunda implementación de prearranque ni cálculo.

### POST /assistant/v1/t03/ejecutar

Reutiliza exactamente `executeT03Protected`. Puede producir los efectos T03 que ya forman parte del flujo canónico de CASTABOT, incluido COM/postregistro cuando corresponda. BASCULAYPENSION no escribe ni modifica registros CASTABOT directamente.

## Contexto de pantalla

Contrato reservado para la siguiente fase:

```json
{
  "module": "PENSION_ENTRY",
  "screen": "NEW_ENTRY",
  "user_role": "SUPERVISION",
  "shift": "TARDE",
  "tractor_plate": "63BC3E",
  "economic_number": "T16",
  "company": "TRANSFAM",
  "folio": "00049"
}
```

El contexto debe contener sólo los datos necesarios para la consulta. No enviar contraseñas, secretos, fotografías, tokens OAuth, rutas internas ni la base SQLite.

## Lo que v1 NO hace

- No abre pension.db.
- No ejecuta SQL contra BASCULAYPENSION.
- No registra entradas, salidas, pesajes ni cortes.
- No modifica usuarios.
- No expone una API genérica de escritura.
- No llama todavía a un modelo conversacional externo desde el backend.
- No reemplaza el motor T03 existente.

## Activación futura

1. CI verde en la rama.
2. Prueba local del handshake.
3. Cliente BASCULAYPENSION implementado con timeout y operación no bloqueante.
4. Credencial exclusiva instalada en Windows.
5. Render: agregar secreto y mantener feature flag false.
6. Deploy.
7. Verificar 404 del bridge con flag false.
8. Activar flag true.
9. Verificar handshake.
10. Ejecutar T03 E2E controlado.
