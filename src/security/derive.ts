import { createHmac } from 'node:crypto';

export function deriveFeatureSecret(rootSecret: string, label: string): string {
  if (!rootSecret.trim()) {
    throw new Error('ROOT_SECRET_REQUIRED');
  }
  if (!label.trim()) {
    throw new Error('SECRET_LABEL_REQUIRED');
  }

  return createHmac('sha256', rootSecret)
    .update(`CASTABOT|${label.trim()}`, 'utf8')
    .digest('hex');
}
