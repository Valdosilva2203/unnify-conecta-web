/**
 * Constantes da integração com a TMDB.
 *
 * Este arquivo — e toda a pasta `core/` — é TypeScript puro, sem nenhum import
 * do Next ou do React, para ser reaproveitado no app Expo mais adiante.
 */

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/** Idioma pedido à API. Títulos, sinopses e gêneros voltam traduzidos. */
export const LANGUAGE = "pt-BR";

/** Região de disponibilidade. Todo filtro por serviço de streaming depende dela. */
export const WATCH_REGION = "BR";

export const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

/** Tamanhos oferecidos pela TMDB para cada tipo de imagem. */
export const POSTER_SIZES = ["w154", "w185", "w342", "w500", "w780", "original"] as const;
export const BACKDROP_SIZES = ["w300", "w780", "w1280", "original"] as const;
export const LOGO_SIZES = ["w45", "w92", "w154", "w185", "original"] as const;

export type PosterSize = (typeof POSTER_SIZES)[number];
export type BackdropSize = (typeof BACKDROP_SIZES)[number];
export type LogoSize = (typeof LOGO_SIZES)[number];

/**
 * IDs de provedor usados direto no código, conferidos contra
 * `/watch/providers/movie?watch_region=BR` (93 serviços no Brasil).
 *
 * Atenção: os IDs mudam por região. O Prime Video no Brasil é 119 — o 9, que
 * aparece na maioria dos exemplos da internet, é o da conta americana e devolve
 * zero resultado aqui.
 */
export const PROVIDER = {
  netflix: 8,
  primeVideo: 119,
  appleTv: 350,
  disneyPlus: 337,
  paramountPlus: 531,
  hboMax: 1899,
  globoplay: 307,
  crunchyroll: 283,
} as const;

/**
 * Formas de disponibilidade. `flatrate` é o que a assinatura cobre — é isso que
 * "está no streaming" significa. `rent` e `buy` são aluguel e compra.
 */
export type MonetizationType = "flatrate" | "free" | "ads" | "rent" | "buy";

/** O discover da TMDB não passa da página 500, independente do total informado. */
export const MAX_DISCOVER_PAGE = 500;
