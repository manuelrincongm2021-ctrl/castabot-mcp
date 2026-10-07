import * as z from 'zod/v4';

const NormSnapshotSchema = z.object({
  ok: z.literal(true),
  source: z.literal('CASTABOT_NORM'),
  text: z.string().min(1),
  digest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  updated_at: z.string().nullable(),
  read_at: z.string().min(1),
});

export type NormSnapshot = z.infer<typeof NormSnapshotSchema>;

export async function fetchNormSnapshot(args: {
  url: string;
  secret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<NormSnapshot> {
  const url = args.url.trim();
  const secret = args.secret.trim();

  if (!url || !secret) {
    throw new Error('NORM_BACKEND_NOT_CONFIGURED');
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('NORM_BACKEND_URL_MUST_BE_HTTPS');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? 25_000,
  );

  try {
    const response = await (args.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        secret,
        accion: 'LEER_NORMA_CASTABOT',
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`NORM_BACKEND_HTTP_${response.status}`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('NORM_BACKEND_JSON_INVALIDO');
    }

    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).ok === false
    ) {
      throw new Error(
        String(
          (raw as Record<string, unknown>).error ||
            'NORM_BACKEND_OK_FALSE',
        ),
      );
    }

    const parsed = NormSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `NORM_BACKEND_RESPONSE_INVALID: ${parsed.error.message}`,
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('NORM_BACKEND_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
