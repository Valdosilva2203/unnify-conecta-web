// Limitador em memória por janela deslizante.
// Vale por instância do servidor: em ambiente serverless com várias instâncias o limite é aproximado.
// Para produção com tráfego alto, trocar por armazenamento compartilhado (ex.: Upstash/Redis).

const registros = new Map<string, number[]>();

export function excedeuLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  const recentes = (registros.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (recentes.length >= maximo) {
    registros.set(chave, recentes);
    return true;
  }
  recentes.push(agora);
  registros.set(chave, recentes);

  if (registros.size > 10_000) {
    for (const [k, v] of registros) {
      if (v.every((t) => agora - t >= janelaMs)) registros.delete(k);
    }
  }
  return false;
}

export function ipDaRequisicao(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'desconhecido';
}
