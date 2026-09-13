/**
 * Mostrado quando falta o token ou quando a TMDB o rejeita. Vale mais que uma
 * tela de erro: a troca entre a "Chave da API (v3)" e o "Token de Leitura (v4)"
 * é o tropeço mais comum no primeiro dia.
 */
export default function SetupNotice({ erro }: { erro?: string }) {
  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-6">
      <h2 className="text-lg font-semibold text-amber-200">
        {erro ? "A TMDB recusou a credencial" : "Falta configurar o token da TMDB"}
      </h2>

      {erro && (
        <p className="mt-2 rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-amber-100/80">
          {erro}
        </p>
      )}

      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-white/70">
        <li>
          Crie uma conta em{" "}
          <a
            className="text-amber-200 underline underline-offset-2"
            href="https://www.themoviedb.org/signup"
            target="_blank"
            rel="noreferrer"
          >
            themoviedb.org
          </a>{" "}
          e peça uma chave em Configurações → API. Uso pessoal é aprovado na hora.
        </li>
        <li>
          Copie o <strong className="text-white/90">Token de Leitura da API</strong> — o
          texto longo que começa com <code className="font-mono text-xs">eyJ</code>. Não é
          a Chave da API (v3), que é curta.
        </li>
        <li>
          Cole em <code className="font-mono text-xs">.env.local</code>, na linha{" "}
          <code className="font-mono text-xs">TMDB_ACCESS_TOKEN=</code>.
        </li>
        <li>
          Reinicie o servidor: <code className="font-mono text-xs">npm run dev</code>.
        </li>
      </ol>
    </div>
  );
}
