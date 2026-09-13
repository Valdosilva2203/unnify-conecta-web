import { tmdbFetch, type Query } from "./client";
import {
  MAX_DISCOVER_PAGE,
  WATCH_REGION,
  type MonetizationType,
} from "./config";
import type {
  TmdbGenre,
  TmdbGenreList,
  TmdbMovie,
  TmdbMovieDetail,
  TmdbPage,
  TmdbProvider,
  TmdbProviderList,
  TmdbTv,
  TmdbTvDetail,
  TmdbWatchOffer,
} from "./types";
import { normalize, type MediaItem, type MediaType } from "../media/normalize";

/**
 * Uma função por uso do app. Nenhuma tela monta querystring de TMDB à mão.
 */

/** Segundos de cache por tipo de dado. Todos muito abaixo do limite de 6 meses dos termos da TMDB. */
export const CACHE_SECONDS = {
  providers: 60 * 60 * 24,
  genres: 60 * 60 * 24,
  discover: 60 * 60,
  detail: 60 * 60 * 6,
  search: 60,
} as const;

/** `|` é OU, `,` é E. Filtro de serviço quase sempre quer OU. */
function orList(values: readonly (string | number)[] | undefined): string | undefined {
  return values?.length ? values.join("|") : undefined;
}

export type MediaPage = {
  items: MediaItem[];
  page: number;
  totalPages: number;
  totalResults: number;
};

/** Ordenações expostas na interface, neutras entre filme e série. */
export type SortOption =
  | "popularidade"
  | "nota"
  | "lancamento"
  | "titulo";

function sortParam(sort: SortOption, mediaType: MediaType): string {
  const isMovie = mediaType === "movie";
  switch (sort) {
    case "nota":
      return "vote_average.desc";
    case "lancamento":
      return isMovie ? "primary_release_date.desc" : "first_air_date.desc";
    case "titulo":
      return isMovie ? "title.asc" : "name.asc";
    case "popularidade":
    default:
      return "popularity.desc";
  }
}

export type DiscoverParams = {
  mediaType: MediaType;
  /** IDs de serviço; combinados com OU. */
  providerIds?: number[];
  /** Padrão: só `flatrate` — o que a assinatura cobre. */
  monetization?: MonetizationType[];
  genreIds?: number[];
  sort?: SortOption;
  page?: number;
  /** Corta títulos com pouquíssimos votos, que poluem a ordenação por nota. */
  minVoteCount?: number;
  yearFrom?: number;
  yearTo?: number;
};

/**
 * Catálogo filtrado.
 *
 * `watch_region` entra sempre que há filtro de serviço ou de monetização: sem
 * ele a TMDB ignora o filtro em silêncio e devolve o catálogo inteiro.
 */
export async function discover(params: DiscoverParams): Promise<MediaPage> {
  const {
    mediaType,
    providerIds,
    monetization = ["flatrate"],
    genreIds,
    sort = "popularidade",
    page = 1,
    minVoteCount = 50,
    yearFrom,
    yearTo,
  } = params;

  const isMovie = mediaType === "movie";
  const providers = orList(providerIds);
  const money = orList(monetization);
  const filtraDisponibilidade = Boolean(providers || money);

  const query: Query = {
    page: Math.min(Math.max(page, 1), MAX_DISCOVER_PAGE),
    sort_by: sortParam(sort, mediaType),
    "vote_count.gte": minVoteCount,
    include_adult: false,
    with_watch_providers: providers,
    with_watch_monetization_types: money,
    watch_region: filtraDisponibilidade ? WATCH_REGION : undefined,
    with_genres: orList(genreIds),
  };

  if (yearFrom) {
    query[isMovie ? "primary_release_date.gte" : "first_air_date.gte"] = `${yearFrom}-01-01`;
  }
  if (yearTo) {
    query[isMovie ? "primary_release_date.lte" : "first_air_date.lte"] = `${yearTo}-12-31`;
  }

  const raw = await tmdbFetch<TmdbPage<TmdbMovie | TmdbTv>>(
    isMovie ? "/discover/movie" : "/discover/tv",
    { query, revalidate: CACHE_SECONDS.discover },
  );

  return {
    items: raw.results.map((result) => normalize(result, mediaType)),
    page: raw.page,
    // O discover não serve além da página 500, mesmo informando um total maior.
    totalPages: Math.min(raw.total_pages, MAX_DISCOVER_PAGE),
    totalResults: raw.total_results,
  };
}

export type Provider = {
  id: number;
  name: string;
  logoPath: string;
  priority: number;
};

/** Serviços disponíveis no Brasil, na ordem de exibição que a própria TMDB sugere. */
export async function getProviders(mediaType: MediaType): Promise<Provider[]> {
  const raw = await tmdbFetch<TmdbProviderList>(
    mediaType === "movie" ? "/watch/providers/movie" : "/watch/providers/tv",
    {
      query: { watch_region: WATCH_REGION },
      revalidate: CACHE_SECONDS.providers,
    },
  );

  return raw.results
    .map((provider: TmdbProvider) => ({
      id: provider.provider_id,
      name: provider.provider_name,
      logoPath: provider.logo_path,
      priority: provider.display_priorities?.[WATCH_REGION] ?? provider.display_priority,
    }))
    .sort((a, b) => a.priority - b.priority);
}

export type WatchOffer = {
  id: number;
  name: string;
  logoPath: string;
};

/** Onde assistir no Brasil, separado por forma de acesso. */
export type WatchInfo = {
  /** Página da TMDB com os links — os termos pedem que o tráfego vá para lá. */
  link: string | null;
  /** Incluído na assinatura. É isto que "está no streaming" significa. */
  flatrate: WatchOffer[];
  /** Grátis, com ou sem anúncio. */
  free: WatchOffer[];
  rent: WatchOffer[];
  buy: WatchOffer[];
};

export type MediaDetail = {
  item: MediaItem;
  tagline: string;
  genres: Genre[];
  /** Duração do filme, ou do episódio médio da série. */
  runtimeMinutes: number | null;
  seasons: number | null;
  watch: WatchInfo;
};

function toOffers(raw: TmdbWatchOffer[] | undefined): WatchOffer[] {
  return (raw ?? [])
    .slice()
    .sort((a, b) => a.display_priority - b.display_priority)
    .map((offer) => ({
      id: offer.provider_id,
      name: offer.provider_name,
      logoPath: offer.logo_path,
    }));
}

/**
 * Detalhe completo em UMA chamada.
 *
 * `append_to_response` costura sub-recursos na mesma resposta — sem ele seriam
 * duas viagens à API só para saber onde assistir.
 */
export async function getDetail(
  mediaType: MediaType,
  id: number,
): Promise<MediaDetail> {
  const isMovie = mediaType === "movie";
  const raw = await tmdbFetch<TmdbMovieDetail | TmdbTvDetail>(
    isMovie ? `/movie/${id}` : `/tv/${id}`,
    {
      query: { append_to_response: "watch/providers" },
      revalidate: CACHE_SECONDS.detail,
    },
  );

  const br = raw["watch/providers"]?.results?.[WATCH_REGION];
  const movie = isMovie ? (raw as TmdbMovieDetail) : null;
  const tv = isMovie ? null : (raw as TmdbTvDetail);

  return {
    item: normalize(raw, mediaType),
    tagline: raw.tagline ?? "",
    genres: (raw.genres ?? []).map((genre) => ({ id: genre.id, name: genre.name })),
    runtimeMinutes: movie ? movie.runtime : (tv?.episode_run_time?.[0] ?? null),
    seasons: tv ? tv.number_of_seasons : null,
    watch: {
      link: br?.link ?? null,
      flatrate: toOffers(br?.flatrate),
      // A TMDB separa grátis de grátis-com-anúncio; para quem assiste, é o mesmo.
      free: [...toOffers(br?.free), ...toOffers(br?.ads)],
      rent: toOffers(br?.rent),
      buy: toOffers(br?.buy),
    },
  };
}

export type Genre = { id: number; name: string };

export async function getGenres(mediaType: MediaType): Promise<Genre[]> {
  const raw = await tmdbFetch<TmdbGenreList>(
    mediaType === "movie" ? "/genre/movie/list" : "/genre/tv/list",
    { revalidate: CACHE_SECONDS.genres },
  );
  return raw.genres.map((genre: TmdbGenre) => ({ id: genre.id, name: genre.name }));
}
