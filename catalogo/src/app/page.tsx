import Attribution from "@/components/Attribution";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import SetupNotice from "@/components/SetupNotice";
import SiteHeader from "@/components/SiteHeader";
import type { MediaItem, MediaType } from "@/core/media/normalize";
import { hasTmdbToken, TmdbError } from "@/core/tmdb/client";
import { PROVIDER } from "@/core/tmdb/config";
import { discover, type MediaPage } from "@/core/tmdb/endpoints";

/**
 * Home no formato de billboard + prateleiras.
 *
 * Uma chamada de discover por prateleira, todas em paralelo e cacheadas por uma
 * hora — a página inteira custa seis requisições à TMDB por hora, não por visita.
 */

type Prateleira = {
  titulo: string;
  mediaType: MediaType;
  provider: number;
};

const PRATELEIRAS: Prateleira[] = [
  { titulo: "Populares na Netflix", mediaType: "movie", provider: PROVIDER.netflix },
  { titulo: "Séries na Netflix", mediaType: "tv", provider: PROVIDER.netflix },
  { titulo: "Em alta no Prime Video", mediaType: "movie", provider: PROVIDER.primeVideo },
  { titulo: "Destaques do Disney+", mediaType: "movie", provider: PROVIDER.disneyPlus },
  { titulo: "Séries na HBO Max", mediaType: "tv", provider: PROVIDER.hboMax },
  { titulo: "No Globoplay", mediaType: "movie", provider: PROVIDER.globoplay },
];

/** O destaque precisa de arte larga e de sinopse — sem isso o topo fica vazio. */
function escolherDestaque(itens: MediaItem[]): MediaItem | null {
  return itens.find((item) => item.backdropPath && item.overview) ?? itens[0] ?? null;
}

export default async function Home() {
  if (!hasTmdbToken()) return <TelaDeSetup />;

  let paginas: MediaPage[];
  try {
    paginas = await Promise.all(
      PRATELEIRAS.map((prateleira) =>
        discover({
          mediaType: prateleira.mediaType,
          providerIds: [prateleira.provider],
          monetization: ["flatrate"],
          sort: "popularidade",
        }),
      ),
    );
  } catch (erro) {
    if (erro instanceof TmdbError && (erro.status === 401 || erro.status === 404)) {
      return <TelaDeSetup erro={erro.statusMessage} />;
    }
    throw erro;
  }

  const destaque = escolherDestaque(paginas[0].items);

  return (
    <main className="min-h-screen">
      <SiteHeader sobreposta />

      {destaque && <Hero item={destaque} chamada={PRATELEIRAS[0].titulo} />}

      {/* As prateleiras sobem sobre o pé da arte, como no layout de referência. */}
      <div className="relative z-10 -mt-10 space-y-2 pb-4 lg:-mt-16">
        {paginas.map((pagina, i) => (
          <Row
            key={`${PRATELEIRAS[i].mediaType}-${PRATELEIRAS[i].provider}`}
            title={PRATELEIRAS[i].titulo}
            count={pagina.totalResults}
            // O destaque já ocupa a tela inteira acima; repeti-lo logo abaixo seria eco.
            items={
              i === 0
                ? pagina.items.filter((item) => item.id !== destaque?.id)
                : pagina.items
            }
          />
        ))}
      </div>

      <div className="px-5 sm:px-8 lg:px-12">
        <Attribution />
      </div>
    </main>
  );
}

function TelaDeSetup({ erro }: { erro?: string }) {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-5 py-16">
        <SetupNotice erro={erro} />
      </div>
    </main>
  );
}
