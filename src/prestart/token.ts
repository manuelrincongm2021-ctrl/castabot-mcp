import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export type PrestartTask = 'T03';

export type T03PrestartContext = {
  identifierType: 'NUMERO_ECONOMICO' | 'MATRICULA';
  identifierValue: string;
  weightType: 'BRUTO' | 'TARA';
  currentWeightKg: number;
};

export type PrestartClaims = {
  version: 'prestart-v1';
  jti: string;
  task: PrestartTask;
  mode: 'OPERATIVO';
  taskContextDigest: string;
  normRevisionTag: string;
  ruleContractVersion: string;
  dataRouteClass: string;
  issuedAt: number;
  expiresAt: number;
};

export type VerifiedPrestart = {
  claims: PrestartClaims;
};

function b64url(input: Buffer): string {
  return input.toString('base64url');
}

function fromB64url(input: string): Buffer {
  const decoded = Buffer.from(input, 'base64url');

  // Exigir codificación canónica evita representaciones textuales alternativas
  // del mismo byte string y hace que cualquier alteración del token sea rechazo.
  if (b64url(decoded) !== input) {
    throw new Error('PRESTART_INVALID_ENCODING');
  }

  return decoded;
}

function deriveKey(secret: string): Buffer {
  if (!secret.trim()) {
    throw new Error('PRESTART_SECRET_REQUIRED');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function normalizeT03Context(context: T03PrestartContext): T03PrestartContext {
  if (!Number.isFinite(context.currentWeightKg) || context.currentWeightKg <= 0) {
    throw new Error('INVALID_CURRENT_WEIGHT');
  }

  const identifierValue = context.identifierValue.trim().toUpperCase();
  if (!identifierValue) {
    throw new Error('INVALID_IDENTIFIER');
  }

  return {
    identifierType: context.identifierType,
    identifierValue,
    weightType: context.weightType,
    currentWeightKg: Number(context.currentWeightKg),
  };
}

export function digestT03Context(context: T03PrestartContext): string {
  const normalized = normalizeT03Context(context);
  const canonical = JSON.stringify({
    identifier_type: normalized.identifierType,
    identifier_value: normalized.identifierValue,
    weight_type: normalized.weightType,
    current_weight_kg: normalized.currentWeightKg,
  });

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function issuePrestartToken(args: {
  secret: string;
  context: T03PrestartContext;
  normRevisionTag: string;
  dataRouteClass: string;
  ttlSeconds?: number;
  nowMs?: number;
  jti?: string;
}): { token: string; claims: PrestartClaims } {
  const ttlSeconds = args.ttlSeconds ?? 600;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('INVALID_TTL');
  }

  const nowMs = args.nowMs ?? Date.now();
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + ttlSeconds;

  if (!args.normRevisionTag.trim()) {
    throw new Error('NORM_REVISION_REQUIRED');
  }
  if (!args.dataRouteClass.trim()) {
    throw new Error('DATA_ROUTE_REQUIRED');
  }

  const claims: PrestartClaims = {
    version: 'prestart-v1',
    jti: args.jti ?? randomBytes(16).toString('hex'),
    task: 'T03',
    mode: 'OPERATIVO',
    taskContextDigest: digestT03Context(args.context),
    normRevisionTag: args.normRevisionTag.trim(),
    ruleContractVersion: 't03-v1',
    dataRouteClass: args.dataRouteClass.trim(),
    issuedAt,
    expiresAt,
  };

  const key = deriveKey(args.secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(claims), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const token = [
    'pst1',
    b64url(iv),
    b64url(ciphertext),
    b64url(tag),
  ].join('.');

  return { token, claims };
}

export function verifyPrestartToken(args: {
  token: string;
  secret: string;
  expectedContext: T03PrestartContext;
  nowMs?: number;
}): VerifiedPrestart {
  const parts = args.token.split('.');
  if (parts.length !== 4 || parts[0] !== 'pst1') {
    throw new Error('PRESTART_INVALID');
  }

  try {
    const key = deriveKey(args.secret);
    const iv = fromB64url(parts[1]);
    const ciphertext = fromB64url(parts[2]);
    const tag = fromB64url(parts[3]);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    const claims = JSON.parse(plaintext) as PrestartClaims;

    if (
      claims.version !== 'prestart-v1' ||
      claims.task !== 'T03' ||
      claims.mode !== 'OPERATIVO' ||
      !claims.jti ||
      !claims.normRevisionTag ||
      !claims.ruleContractVersion
    ) {
      throw new Error('PRESTART_INVALID');
    }

    const nowSeconds = Math.floor((args.nowMs ?? Date.now()) / 1000);
    if (nowSeconds >= claims.expiresAt) {
      throw new Error('PRESTART_EXPIRED');
    }

    const expectedDigest = digestT03Context(args.expectedContext);
    if (claims.taskContextDigest !== expectedDigest) {
      throw new Error('PRESTART_CONTEXT_MISMATCH');
    }

    return { claims };
  } catch (error) {
    if (
      error instanceof Error &&
      ['PRESTART_EXPIRED', 'PRESTART_CONTEXT_MISMATCH'].includes(error.message)
    ) {
      throw error;
    }
    throw new Error('PRESTART_INVALID');
  }
}
