import {
  IMAGE_BASE_URL,
  type BackdropSize,
  type LogoSize,
  type PosterSize,
} from "../tmdb/config";

/**
 * A TMDB devolve só o caminho da imagem (`/abc123.jpg`); a URL completa é
 * montada com a base e um tamanho. Pedir o tamanho certo é o que segura o peso
 * da grade de pôsteres.
 */

function imageUrl(path: string | null, size: string): string | null {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function posterUrl(path: string | null, size: PosterSize = "w342"): string | null {
  return imageUrl(path, size);
}

export function backdropUrl(
  path: string | null,
  size: BackdropSize = "w1280",
): string | null {
  return imageUrl(path, size);
}

export function providerLogoUrl(path: string | null, size: LogoSize = "w92"): string | null {
  return imageUrl(path, size);
}

/** Pôster da TMDB é sempre 2:3 — útil para reservar espaço e evitar salto de layout. */
export const POSTER_ASPECT_RATIO = 2 / 3;
