/**
 * Tipos das respostas cruas da TMDB, com os nomes de campo exatamente como a
 * API devolve (snake_case). Nada daqui deve chegar aos componentes: passe
 * sempre pelo normalizador em `core/media/normalize.ts`.
 */

export type TmdbPage<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

/** Campos que filme e série compartilham com o mesmo nome. */
type TmdbMediaBase = {
  id: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  popularity: number;
  adult?: boolean;
};

/** Um filme. Usa `title` e `release_date`. */
export type TmdbMovie = TmdbMediaBase & {
  title: string;
  original_title: string;
  release_date: string;
  media_type?: "movie";
};

/** Uma série. Usa `name` e `first_air_date` para a mesma informação. */
export type TmdbTv = TmdbMediaBase & {
  name: string;
  original_name: string;
  first_air_date: string;
  media_type?: "tv";
};

export type TmdbGenre = {
  id: number;
  name: string;
};

export type TmdbGenreList = {
  genres: TmdbGenre[];
};

export type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
  display_priorities?: Record<string, number>;
};

export type TmdbProviderList = {
  results: TmdbProvider[];
};

/** Um serviço listado dentro de `watch/providers`. */
export type TmdbWatchOffer = {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
};

/** Disponibilidade por país. `flatrate` é o que a assinatura cobre. */
export type TmdbWatchProviders = {
  results: Record<
    string,
    {
      link: string;
      flatrate?: TmdbWatchOffer[];
      free?: TmdbWatchOffer[];
      ads?: TmdbWatchOffer[];
      rent?: TmdbWatchOffer[];
      buy?: TmdbWatchOffer[];
    }
  >;
};

/** Campos extras que só a chamada de detalhe traz. */
type TmdbDetailExtras = {
  genres: TmdbGenre[];
  tagline: string;
  /** Vem de `append_to_response=watch/providers`. A chave tem barra mesmo. */
  "watch/providers"?: TmdbWatchProviders;
};

export type TmdbMovieDetail = TmdbMovie &
  TmdbDetailExtras & {
    runtime: number | null;
  };

export type TmdbTvDetail = TmdbTv &
  TmdbDetailExtras & {
    number_of_seasons: number;
    episode_run_time: number[];
  };

/** Resposta de erro da API — vem com HTTP 4xx/5xx. */
export type TmdbErrorBody = {
  success?: boolean;
  status_code?: number;
  status_message?: string;
};
