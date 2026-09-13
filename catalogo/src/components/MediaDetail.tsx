import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { backdropUrl, posterUrl, providerLogoUrl } from "@/core/media/images";
import type { MediaType } from "@/core/media/normalize";
import { TmdbError } from "@/core/tmdb/client";
import { getDetail, type WatchOffer } from "@/core/tmdb/endpoints";
import Attribution from "./Attribution";
import Nota from "./Nota";
import SiteHeader from "./SiteHeader";

/**
 * Página de detalhe, compartilhada por `/filme/[id]` e `/serie/[id]`.
 *
 * Versão enxuta: arte, ficha e onde assistir. Trailer, elenco e recomendações
 * entram na Fase 2 — mas "onde assistir" vem desde já, porque é a pergunta que
 * traz o usuário ao app.
 */
export default async function MediaDetail({
  mediaType,
  id,
}: {
  mediaType: MediaType;
  id: number;
}) {
  if (!Number.isFinite(id)) notFound();

  let detalhe;
  try {
    detalhe = await getDetail(mediaType, id);
  } catch (erro) {
    if (erro instanceof TmdbError && erro.status === 404) notFound();
    throw erro;
  }

  const { item, tagline, genres, runtimeMinutes, seasons, watch } = detalhe;
  const backdrop = backdropUrl(item.backdropPath, "w1280");
  const poster = posterUrl(item.posterPath, "w500");

  return (
    <main className="min-h-screen">
      <SiteHeader sobreposta />

      <div className="relative h-[clamp(300px,48svh,480px)] w-full">
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_18%]"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/50 to-ink/40" />
      </div>

      <div className="relative z-10 -mt-32 px-5 pb-16 sm:px-8 lg:px-12 lg:-mt-44">
        <div className="mx-auto flex max-w-5xl flex-col gap-7 sm:flex-row sm:gap-9">
          {poster && (
            <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9)] sm:w-44 lg:w-56">
              <Image
                src={poster}
                alt={`Pôster de ${item.title}`}
                fill
                sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 224px"
                className="object-cover"
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-pretty text-3xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
              {item.title}
            </h1>

            {item.originalTitle && item.originalTitle !== item.title && (
              <p className="mt-2 text-sm text-white/40">{item.originalTitle}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/60">
              <Nota valor={item.voteAverage} votos={item.voteCount} />
              {item.year && <Separador valor={String(item.year)} />}
              <Separador valor={mediaType === "movie" ? "Filme" : "Série"} />
              {runtimeMinutes ? <Separador valor={formatarDuracao(runtimeMinutes)} /> : null}
              {seasons ? (
                <Separador
                  valor={`${seasons} ${seasons === 1 ? "temporada" : "temporadas"}`}
                />
              ) : null}
            </div>

            {genres.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2">
                {genres.map((genero) => (
                  <li
                    key={genero.id}
                    className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs text-white/65"
                  >
                    {genero.name}
                  </li>
                ))}
              </ul>
            )}

            {tagline && (
              <p className="mt-6 text-[15px] italic text-gold/85">“{tagline}”</p>
            )}

            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/70">
              {item.overview || "Sinopse ainda não disponível em português."}
            </p>
          </div>
        </div>

        <section className="mx-auto mt-14 max-w-5xl border-t border-white/10 pt-8">
          <h2 className="text-lg font-semibold tracking-tight">Onde assistir</h2>
          <p className="mt-1 text-xs text-white/35">no Brasil</p>

          {watch.flatrate.length === 0 &&
          watch.free.length === 0 &&
          watch.rent.length === 0 &&
          watch.buy.length === 0 ? (
            <p className="mt-5 text-sm text-white/50">
              Nenhum serviço brasileiro oferece este título no momento.
            </p>
          ) : (
            <div className="mt-6 space-y-7">
              <GrupoDeServicos titulo="Incluído na assinatura" ofertas={watch.flatrate} />
              <GrupoDeServicos titulo="Grátis" ofertas={watch.free} />
              <GrupoDeServicos titulo="Aluguel" ofertas={watch.rent} discreto />
              <GrupoDeServicos titulo="Compra" ofertas={watch.buy} discreto />
            </div>
          )}

          {watch.link && (
            <a
              href={watch.link}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-1.5 text-sm text-white/55 underline underline-offset-4 transition hover:text-white"
            >
              Abrir os links na TMDB
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </section>

        <div className="mx-auto max-w-5xl">
          <Link
            href="/"
            className="mt-10 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            Voltar ao catálogo
          </Link>

          <Attribution />
        </div>
      </div>
    </main>
  );
}

function Separador({ valor }: { valor: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-white/25">
        ·
      </span>
      <span className="tabular-nums">{valor}</span>
    </>
  );
}

/**
 * Assinatura e aluguel ficam visualmente separados de propósito: misturar os
 * dois faz o app prometer o que a assinatura não cobre.
 */
function GrupoDeServicos({
  titulo,
  ofertas,
  discreto = false,
}: {
  titulo: string;
  ofertas: WatchOffer[];
  discreto?: boolean;
}) {
  if (ofertas.length === 0) return null;

  return (
    <div>
      <h3
        className={`text-xs font-semibold uppercase tracking-[0.12em] ${
          discreto ? "text-white/35" : "text-gold"
        }`}
      >
        {titulo}
      </h3>
      <ul className="mt-3 flex flex-wrap gap-2.5">
        {ofertas.map((oferta) => {
          const logo = providerLogoUrl(oferta.logoPath, "w92");
          return (
            <li
              key={oferta.id}
              className={`flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-2 pr-3.5 ${
                discreto ? "opacity-70" : ""
              }`}
            >
              {logo && (
                <Image
                  src={logo}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              )}
              <span className="text-[13px] font-medium text-white/85">{oferta.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto}min`;
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
}
