"use client";

import { useRef } from "react";
import PosterCard from "./PosterCard";
import type { MediaItem } from "@/core/media/normalize";

/**
 * Prateleira horizontal.
 *
 * A rolagem é nativa — arrastar no touch, shift+roda no desktop —, então
 * funciona sem JavaScript. As setas são um atalho para quem usa mouse e só
 * aparecem em telas grandes, onde não há gesto de arrastar.
 */
export default function Row({
  title,
  count,
  items,
}: {
  title: string;
  count?: number;
  items: MediaItem[];
}) {
  const trilho = useRef<HTMLUListElement>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilho.current;
    if (!el) return;
    el.scrollBy({ left: direcao * el.clientWidth * 0.85, behavior: "smooth" });
  }

  // Serviço sem títulos não vira prateleira vazia: some da página.
  if (items.length === 0) return null;

  return (
    <section className="group/row relative py-4">
      <div className="mb-3 flex items-baseline justify-between gap-4 px-5 sm:px-8 lg:px-12">
        <h2 className="text-base font-semibold tracking-tight text-white/90 sm:text-lg">
          {title}
        </h2>
        {count !== undefined && (
          <span className="shrink-0 text-[11px] tabular-nums text-white/30">
            {count.toLocaleString("pt-BR")} títulos
          </span>
        )}
      </div>

      <div className="relative">
        <ul
          ref={trilho}
          className="no-scrollbar flex snap-x gap-3 overflow-x-auto scroll-px-5 px-5 pb-3 sm:gap-4 sm:scroll-px-8 sm:px-8 lg:scroll-px-12 lg:px-12"
        >
          {items.map((item) => (
            <li
              key={`${item.mediaType}-${item.id}`}
              className="w-[37vw] max-w-[178px] shrink-0 snap-start sm:w-[23vw] lg:w-[170px]"
            >
              <PosterCard item={item} />
            </li>
          ))}
        </ul>

        {(["esquerda", "direita"] as const).map((lado) => (
          <button
            key={lado}
            type="button"
            onClick={() => rolar(lado === "direita" ? 1 : -1)}
            aria-label={lado === "direita" ? "Avançar" : "Voltar"}
            className={`absolute inset-y-0 hidden w-12 items-center justify-center bg-ink/80 text-white/70 opacity-0 backdrop-blur-sm transition hover:text-white focus-visible:opacity-100 group-hover/row:opacity-100 lg:flex ${
              lado === "direita" ? "right-0" : "left-0"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-6 w-6 ${lado === "esquerda" ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}
