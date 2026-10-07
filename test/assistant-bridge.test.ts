import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssistantHandshakeInputSchema,
  AssistantContextSchema,
  supportedAssistantCapabilities
} from '../src/assistant/contracts.js';
import {
  constantTimeSecretEquals,
  extractAssistantApiKey
} from '../src/assistant/security.js';

test('assistant handshake accepts BASCULAYPENSION read-only client', () => {
  const parsed = AssistantHandshakeInputSchema.safeParse({
    app: 'BASCULAYPENSION',
    app_version: '1.0.0',
    installation_id: 'LENOVO-BASCULA-01',
    mode: 'READ_ONLY',
    requested_capabilities: ['HEALTH_V1', 'T03_V1']
  });
  assert.equal(parsed.success, true);
});

test('assistant handshake rejects non read-only mode', () => {
  const parsed = AssistantHandshakeInputSchema.safeParse({
    app: 'BASCULAYPENSION',
    app_version: '1.0.0',
    installation_id: 'LENOVO-BASCULA-01',
    mode: 'WRITE'
  });
  assert.equal(parsed.success, false);
});

test('assistant context accepts bounded operational context without secrets', () => {
  const parsed = AssistantContextSchema.safeParse({
    module: 'PENSION_ENTRY',
    screen: 'NEW_ENTRY',
    user_role: 'SUPERVISION',
    shift: 'TARDE',
    tractor_plate: '63BC3E',
    company: 'TRANSFAM'
  });
  assert.equal(parsed.success, true);
});

test('assistant capabilities expose T03 only when deterministic T03 is enabled', () => {
  assert.deepEqual(
    supportedAssistantCapabilities(false),
    ['HEALTH_V1', 'CONTEXT_V1']
  );
  assert.deepEqual(
    supportedAssistantCapabilities(true),
    ['HEALTH_V1', 'CONTEXT_V1', 'T03_V1']
  );
});

test('assistant auth supports bearer and dedicated header with constant-time comparison', () => {
  assert.equal(
    extractAssistantApiKey({ authorization: 'Bearer abc123' }),
    'abc123'
  );
  assert.equal(
    extractAssistantApiKey({ 'x-castabot-assistant-key': 'xyz789' }),
    'xyz789'
  );
  assert.equal(constantTimeSecretEquals('same', 'same'), true);
  assert.equal(constantTimeSecretEquals('same', 'different'), false);
});
