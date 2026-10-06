import { createHmac } from 'node:crypto';

function stableBase64url(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64url');
}

export function deriveT03EventIdentity(args: {
  secret: string;
  prestartJti: string;
  taskContextDigest: string;
}): { consultaId: string; eventId: string; idempotencyKey: string } {
  if (!args.secret.trim()) {
    throw new Error('IDEMPOTENCY_SECRET_REQUIRED');
  }
  if (!args.prestartJti.trim() || !args.taskContextDigest.trim()) {
    throw new Error('IDEMPOTENCY_INPUT_REQUIRED');
  }

  const canonical = [
    'T03',
    'v1',
    args.prestartJti.trim(),
    args.taskContextDigest.trim(),
  ].join('|');

  const hex = createHmac('sha256', args.secret)
    .update(canonical, 'utf8')
    .digest('hex');

  const encoded = stableBase64url(hex);
  const consultaId = `T03Q-${encoded.slice(0, 32)}`;
  const eventId = `T03-${encoded.slice(0, 40)}`;

  return {
    consultaId,
    eventId,
    idempotencyKey: hex,
  };
}
