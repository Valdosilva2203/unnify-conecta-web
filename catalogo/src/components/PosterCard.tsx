import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/core/media/images";
import { mediaHref, type MediaItem } from "@/core/media/normalize";

/**
 * Card de pôster. Recebe `MediaItem`, então serve para filme e série sem
 * ramificação — é o retorno prático do normalizador.
 */
export default function PosterCard({
  item,
  priority = false,
}: {
  item: MediaItem;
  priority?: boolean;
}) {
  const poster = posterUrl(item.posterPath, "w342");
  const nota = item.voteAverage > 0 ? item.voteAverage.toFixed(1) : null;

  return (
    <Link href={mediaHref(item)} className="group block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:ring-white/25 group-hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)]">
        {poster ? (
          <Image
            src={poster}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 640px) 40vw, (max-width: 1024px) 24vw, 190px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-white/30">
            sem pôster
          </div>
        )}

        {/* Escurece o pé do pôster no hover, para o card parecer acionável. */}
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {nota && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gold ring-1 ring-white/10 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
              <path d="M12 2.5l2.9 6.05 6.6.9-4.8 4.6 1.2 6.55L12 17.5l-5.9 3.1 1.2-6.55-4.8-4.6 6.6-.9z" />
            </svg>
            {nota}
          </span>
        )}
      </div>

      <h3 className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug text-white/85 transition-colors group-hover:text-white">
        {item.title}
      </h3>
      <p className="mt-0.5 text-[11px] tabular-nums text-white/35">
        {item.year ?? "—"} · {item.mediaType === "movie" ? "Filme" : "Série"}
      </p>
    </Link>
  );
}
