import Link from "next/link";

/**
 * Barra do topo, sobreposta ao destaque. Sem menu por enquanto: os links de
 * Filmes, Séries e Busca entram na Fase 1, junto com as rotas que eles abrem.
 */
export default function SiteHeader({ sobreposta = false }: { sobreposta?: boolean }) {
  return (
    <header
      className={
        sobreposta
          ? "absolute inset-x-0 top-0 z-20 bg-linear-to-b from-ink/80 to-transparent"
          : "sticky top-0 z-20 border-b border-white/5 bg-ink/85 backdrop-blur-md"
      }
    >
      <div className="flex items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-gold" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/90">
            Catálogo
          </span>
        </Link>

        <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-white/55 backdrop-blur-sm">
          Brasil
        </span>
      </div>
    </header>
  );
}
