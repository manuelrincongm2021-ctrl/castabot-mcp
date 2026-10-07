import { parseT03SearchResponse, type T03SearchResponse } from './source.js';

export type T03BackendSearchInput = {
  identifierType: 'MATRICULA' | 'NUMERO_ECONOMICO';
  identifierValue: string;
};

export async function fetchT03Search(args: {
  url: string;
  secret: string;
  input: T03BackendSearchInput;
  timeoutMs?: number;
}): Promise<T03SearchResponse> {
  const url = args.url.trim();
  const secret = args.secret.trim();
  const identifierValue = args.input.identifierValue.trim();

  if (!url || !secret) throw new Error('T03_BACKEND_NOT_CONFIGURED');
  if (!identifierValue) throw new Error('T03_IDENTIFIER_REQUIRED');

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('T03_BACKEND_URL_MUST_BE_HTTPS');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? 25_000,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        secret,
        accion: 'BUSCAR_T03_CASTABOT',
        identifier_type: args.input.identifierType,
        identifier_value: identifierValue,
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`T03_BACKEND_HTTP_${response.status}`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('T03_BACKEND_JSON_INVALIDO');
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
            'T03_BACKEND_OK_FALSE',
        ),
      );
    }

    return parseT03SearchResponse(raw);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('T03_BACKEND_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
