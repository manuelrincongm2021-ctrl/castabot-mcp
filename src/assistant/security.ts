import { timingSafeEqual } from 'node:crypto';

export function extractAssistantApiKey(headers: Record<string, unknown>): string {
  const authorization = String(headers.authorization || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return String(headers['x-castabot-assistant-key'] || '').trim();
}

export function constantTimeSecretEquals(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
