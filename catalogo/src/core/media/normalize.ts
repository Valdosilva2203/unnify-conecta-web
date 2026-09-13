import type { TmdbMovie, TmdbTv } from "../tmdb/types";

/**
 * O tipo único que atravessa o app.
 *
 * Filme e série carregam a mesma informação com nomes diferentes na TMDB
 * (`title`/`name`, `release_date`/`first_air_date`). Traduzir isso aqui, uma
 * vez, é o que evita um `if (mediaType === 'movie')` dentro de cada componente.
 */

export type MediaType = "movie" | "tv";

export type MediaItem = {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  /** ISO `YYYY-MM-DD`. A TMDB manda string vazia quando não sabe — aqui vira null. */
  releaseDate: string | null;
  year: number | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function yearOf(date: string | null): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export function normalizeMovie(raw: TmdbMovie): MediaItem {
  const releaseDate = emptyToNull(raw.release_date);
  return {
    id: raw.id,
    mediaType: "movie",
    title: raw.title,
    originalTitle: raw.original_title,
    overview: raw.overview,
    posterPath: raw.poster_path,
    backdropPath: raw.backdrop_path,
    releaseDate,
    year: yearOf(releaseDate),
    voteAverage: raw.vote_average,
    voteCount: raw.vote_count,
    genreIds: raw.genre_ids ?? [],
  };
}

export function normalizeTv(raw: TmdbTv): MediaItem {
  const releaseDate = emptyToNull(raw.first_air_date);
  return {
    id: raw.id,
    mediaType: "tv",
    title: raw.name,
    originalTitle: raw.original_name,
    overview: raw.overview,
    posterPath: raw.poster_path,
    backdropPath: raw.backdrop_path,
    releaseDate,
    year: yearOf(releaseDate),
    voteAverage: raw.vote_average,
    voteCount: raw.vote_count,
    genreIds: raw.genre_ids ?? [],
  };
}

export function normalize(raw: TmdbMovie | TmdbTv, mediaType: MediaType): MediaItem {
  return mediaType === "movie"
    ? normalizeMovie(raw as TmdbMovie)
    : normalizeTv(raw as TmdbTv);
}

/** Rota da página de detalhe. Um lugar só decide a URL de cada tipo. */
export function mediaHref(item: Pick<MediaItem, "id" | "mediaType">): string {
  return item.mediaType === "movie" ? `/filme/${item.id}` : `/serie/${item.id}`;
}
