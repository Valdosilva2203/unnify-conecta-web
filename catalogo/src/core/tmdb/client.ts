import { LANGUAGE, TMDB_BASE_URL } from "./config";
import type { TmdbErrorBody } from "./types";

/**
 * Client HTTP da TMDB.
 *
 * Autentica com o token de leitura v4 no cabeçalho `Authorization: Bearer`, e
 * não com `?api_key=` na query: o cabeçalho vale para v3 e v4 e não deixa a
 * credencial em log de acesso nem no Referer.
 *
 * Só roda no servidor. `TMDB_ACCESS_TOKEN` não tem o prefixo `NEXT_PUBLIC_`,
 * então o bundle do navegador não enxerga o valor — se algum componente com
 * "use client" importar daqui, o build quebra na hora de ler a variável, que é
 * o comportamento desejado.
 */

export type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue>;

export class TmdbError extends Error {
  constructor(
    readonly status: number,
    readonly statusMessage: string,
    readonly path: string,
  ) {
    super(`TMDB ${status} em ${path}: ${statusMessage}`);
    this.name = "TmdbError";
  }
}

export class TmdbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmdbConfigError";
  }
}

/** Há token configurado? Telas usam isso para orientar o setup em vez de estourar. */
export function hasTmdbToken(): boolean {
  return Boolean(process.env.TMDB_ACCESS_TOKEN?.trim());
}

function readToken(): string {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new TmdbConfigError(
      "TMDB_ACCESS_TOKEN ausente. Copie .env.example para .env.local e cole seu " +
        "token de leitura da API (Configurações → API → Token de Leitura da API).",
    );
  }
  return token;
}

function buildUrl(path: string, query: Query = {}): string {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  // `language` vale para toda chamada; quem precisar de outro idioma sobrescreve.
  url.searchParams.set("language", LANGUAGE);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const MAX_ATTEMPTS = 3;
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Espera o que o cabeçalho `Retry-After` pedir; sem ele, backoff exponencial. */
function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 2 ** attempt * 500;
}

export type FetchOptions = {
  query?: Query;
  /**
   * Segundos de cache. O Next lê a chave `next` do RequestInit; fora do Next
   * (no app Expo) a propriedade é simplesmente ignorada, então este arquivo
   * continua portável.
   */
  revalidate: number;
};

export async function tmdbFetch<T>(path: string, options: FetchOptions): Promise<T> {
  const token = readToken();
  const url = buildUrl(path, options.query);

  let lastError: TmdbError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      next: { revalidate: options.revalidate },
    } as RequestInit);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = (await response.json().catch(() => ({}))) as TmdbErrorBody;
    lastError = new TmdbError(
      response.status,
      body.status_message ?? response.statusText,
      path,
    );

    if (!RETRIABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
      throw lastError;
    }

    await delay(retryDelayMs(response, attempt));
  }

  throw lastError ?? new TmdbError(0, "falha desconhecida", path);
}
