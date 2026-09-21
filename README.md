# CASTABOT MCP — ENCOLAR_COM

Servidor MCP propio de CASTABOT para exponer una única herramienta controlada: `ENCOLAR_COM`.

## Arquitectura

```text
CASTABOT / ChatGPT
      ↓ MCP
ENCOLAR_COM
      ↓ HTTPS POST autenticado
Web App COM (accion=ENCOLAR)
      ↓
COLA_COM
      ↓
procesarColaCOM()
      ↓
Telegram
```

El servidor MCP **no** escribe directamente en `COLA_COM`, **no** envía a Telegram directamente y **no** duplica `procesarColaCOM()`.

## Requisitos

- Node.js 20 o superior.
- URL HTTPS vigente del Web App COM.
- `COM_FAST_PATH_SECRET` vigente.
- Para conexión remota con ChatGPT: endpoint HTTPS público estable o túnel MCP seguro.

## Instalación local

```bash
npm install
cp .env.example .env
```

Edita `.env` y completa:

```env
COM_FAST_PATH_URL=https://script.google.com/macros/s/XXXXXXXXXXXX/exec
COM_FAST_PATH_SECRET=tu_secreto_actual
CASTABOT_API_KEY=una_clave_larga_distinta
```

No compartas `.env` ni subas secretos al repositorio. `CASTABOT_API_KEY` debe ser distinta de `COM_FAST_PATH_SECRET`.

## Validar TypeScript

```bash
npm run check
```

## Ejecutar en desarrollo

```bash
npm run dev
```

El endpoint MCP local será:

```text
http://127.0.0.1:3000/mcp
```

El health check será:

```text
http://127.0.0.1:3000/healthz
```

## Probar con MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Selecciona Streamable HTTP y usa:

```text
http://127.0.0.1:3000/mcp
```

Primero verifica `tools/list`. Debe aparecer exactamente la herramienta operativa `ENCOLAR_COM`.

## Contrato de ENCOLAR_COM

Entrada mínima para TEXT:

```json
{
  "event_id": "TEST-MCP-20260921-01",
  "origin": "PRUEBA MCP CASTABOT",
  "confirmed_by_consultant": "SI",
  "type": "TEXT",
  "caption": "Prueba MCP CASTABOT",
  "destination_alias": "ADMINISTRACION"
}
```

Entrada para PHOTO o DOCUMENT requiere además `drive_file_id`.

El servidor agrega internamente:

```json
{
  "secret": "<COM_FAST_PATH_SECRET>",
  "accion": "ENCOLAR"
}
```

El secreto nunca forma parte del esquema visible para el modelo.

## Idempotencia

La herramienta está marcada como idempotente porque el Web App COM rechaza la creación de una segunda fila para un `EVENT_ID` ya existente y devuelve el estado del evento existente.

## Seguridad

La herramienta está anotada como:

- `readOnlyHint: false`
- `destructiveHint: true`
- `idempotentHint: true`
- `openWorldHint: false`

`destructiveHint` es `true` porque una llamada nueva puede producir un mensaje Telegram que no se puede retirar de manera transaccional.

`openWorldHint` es `false` porque el servidor no acepta una URL arbitraria: solo se comunica con el Web App COM configurado por el operador.

## Despliegue

Compilar:

```bash
npm run build
```

Ejecutar producción:

```bash
npm start
```

También se incluye `Dockerfile`.

Para un host público configura, por ejemplo:

```env
PORT=3000
MCP_ALLOWED_HOST=mcp.tudominio.mx
```

y expón mediante HTTPS:

```text
https://mcp.tudominio.mx/mcp
```


## API HTTPS para CASTABOT Plus

Además de MCP, el mismo servidor expone una API HTTPS controlada:

```text
POST /encolar-com
```

En Render:

```text
https://castabot-mcp.onrender.com/encolar-com
```

Autenticación recomendada:

```http
Authorization: Bearer <CASTABOT_API_KEY>
Content-Type: application/json
```

También se acepta el encabezado `x-castabot-api-key`.

Ejemplo de cuerpo TEXT:

```json
{
  "event_id": "TEST-HTTP-20260921-01",
  "origin": "PRUEBA HTTP CASTABOT",
  "confirmed_by_consultant": "SI",
  "type": "TEXT",
  "caption": "Prueba HTTPS CASTABOT",
  "destination_alias": "ADMINISTRACION"
}
```

La API no acepta URL ni secreto del Web App en el cuerpo. El servidor agrega internamente `COM_FAST_PATH_URL`, `COM_FAST_PATH_SECRET` y `accion=ENCOLAR`.

Respuestas principales:

- `200`: el Web App COM respondió satisfactoriamente, incluyendo eventos nuevos o duplicados idempotentes.
- `400`: esquema del evento inválido.
- `401`: clave API ausente o incorrecta.
- `502`: el Web App COM falló o devolvió una respuesta no acreditada.
- `503`: configuración del servidor incompleta.

Prueba de autorización sin enviar un evento válido:

```bash
curl -i -X POST https://castabot-mcp.onrender.com/encolar-com \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Debe responder `401` cuando no se suministra la clave.

Prueba real controlada:

```bash
curl -X POST https://castabot-mcp.onrender.com/encolar-com \
  -H "Authorization: Bearer $CASTABOT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "event_id":"TEST-HTTP-20260921-01",
    "origin":"PRUEBA HTTP CASTABOT",
    "confirmed_by_consultant":"SI",
    "type":"TEXT",
    "caption":"Prueba HTTPS CASTABOT",
    "destination_alias":"ADMINISTRACION"
  }'
```


## Verificación de dominio OpenAI

Cuando OpenAI proporcione un token de verificación, configúralo como:

```env
OPENAI_APPS_CHALLENGE=valor_entregado_por_openai
```

El servidor lo expondrá en:

```text
/.well-known/openai-apps-challenge
```

No inventes este valor antes de recibirlo.

## Criterio de éxito antes de conectar CASTABOT

1. `/healthz` responde `ok:true`.
2. MCP Inspector inicializa el servidor.
3. `tools/list` muestra `ENCOLAR_COM`.
4. Una llamada de prueba controlada genera una sola fila COM y un solo mensaje Telegram.
5. Repetir el mismo `event_id` devuelve el evento existente y no produce un segundo mensaje.
6. Solo después se conecta a ChatGPT/Castabot.
