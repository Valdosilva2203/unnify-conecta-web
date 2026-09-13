import Image from "next/image";
import Link from "next/link";
import { backdropUrl } from "@/core/media/images";
import { mediaHref, type MediaItem } from "@/core/media/normalize";
import Nota from "./Nota";

/**
 * Destaque do topo, no espírito do billboard da Netflix: a arte ocupa a tela e
 * o texto fica sobre a parte escura da imagem.
 *
 * A altura é limitada de propósito — parte da primeira prateleira precisa
 * aparecer abaixo, senão a página parece uma capa e não um catálogo.
 */
export default function Hero({
  item,
  chamada,
}: {
  item: MediaItem;
  chamada: string;
}) {
  const backdrop = backdropUrl(item.backdropPath, "w1280");

  return (
    <section className="relative h-[clamp(520px,74svh,720px)] w-full">
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

      {/* Dois gradientes: um deita a imagem para a esquerda, onde fica o texto;
          o outro funde o pé da arte com o fundo da página. */}
      <div className="absolute inset-0 bg-linear-to-r from-ink via-ink/85 to-ink/20" />
      <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/25 to-ink/50" />

      <div className="relative flex h-full items-end">
        <div className="w-full px-5 pb-10 sm:px-8 lg:px-12 lg:pb-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {chamada}
          </p>

          <h1 className="mt-4 max-w-3xl text-pretty text-4xl font-semibold leading-[1.02] tracking-[-0.03em] drop-shadow-[0_2px_20px_rgb(0_0_0/0.6)] sm:text-5xl lg:text-6xl">
            {item.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/60">
            <Nota valor={item.voteAverage} votos={item.voteCount} />
            {item.year && (
              <>
                <span aria-hidden="true" className="text-white/25">
                  ·
                </span>
                <span className="tabular-nums">{item.year}</span>
              </>
            )}
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <span>{item.mediaType === "movie" ? "Filme" : "Série"}</span>
          </div>

          {item.overview && (
            <p className="mt-4 line-clamp-3 max-w-xl text-[15px] leading-relaxed text-white/70">
              {item.overview}
            </p>
          )}

          <Link
            href={mediaHref(item)}
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white/85"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 7.6v.4" />
            </svg>
            Mais informações
          </Link>
        </div>
      </div>
    </section>
  );
}
