/**
 * Atribuição exigida pelos termos de uso da API da TMDB:
 *  - o aviso de que o app não é endossado nem certificado pela TMDB;
 *  - o crédito ao JustWatch, fonte dos dados de disponibilidade.
 *
 * Falta aqui o logo da TMDB, que deve aparecer menos proeminente que a marca do
 * app — entra na Fase 3, junto com a identidade visual.
 */
export default function Attribution() {
  return (
    <footer className="mt-16 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/40">
      <p>
        Este produto usa a API TMDB, mas não é endossado ou certificado pela TMDB.
      </p>
      <p className="mt-1">
        Dados de disponibilidade nos serviços de streaming fornecidos por JustWatch.
      </p>
    </footer>
  );
}
