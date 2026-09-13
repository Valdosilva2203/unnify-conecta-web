/**
 * Nota da TMDB. Some quando ninguém votou — "0.0" passaria a impressão errada
 * de filme ruim, quando na verdade é filme sem avaliação.
 */
export default function Nota({ valor, votos }: { valor: number; votos?: number }) {
  if (!valor || valor <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-gold">
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M12 2.5l2.9 6.05 6.6.9-4.8 4.6 1.2 6.55L12 17.5l-5.9 3.1 1.2-6.55-4.8-4.6 6.6-.9z" />
      </svg>
      <span className="tabular-nums">{valor.toFixed(1)}</span>
      {votos !== undefined && votos > 0 && (
        <span className="tabular-nums font-normal text-white/40">
          ({votos.toLocaleString("pt-BR")})
        </span>
      )}
    </span>
  );
}
