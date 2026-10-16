import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Isolamento dos testes: o Supabase do .env.local é COMPARTILHADO (DEV = PROD). Testes que acessam o banco de verdade
// (escrita/leitura real, chave de serviço, login real) só rodam se o Supabase configurado for LOCAL.
// Seguros em qualquer ambiente: specs com API simulada (sessaoSimulada) ou marcados com o comentário "teste-sem-banco".

export function urlSupabase(): string {
  const raiz = join(__dirname, '..', '..', '..');
  const env = readFileSync(join(raiz, '.env.local'), 'utf8');
  const linha = env.split(/\r?\n/).find((l) => l.trim().startsWith('NEXT_PUBLIC_SUPABASE_URL='));
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? (linha ? linha.slice(linha.indexOf('=') + 1).trim() : '');
}

export function bancoLocal(url = urlSupabase()): boolean {
  try { return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname); } catch { return false; }
}

// Specs que tocam o banco real: tudo que não usa a API simulada nem se declara "teste-sem-banco"
export function specsComBancoReal(pasta: string): string[] {
  return readdirSync(pasta).filter((f) => f.endsWith('.spec.ts') || f.endsWith('.test.ts')).filter((f) => {
    const texto = readFileSync(join(pasta, f), 'utf8');
    return !texto.includes('sessaoSimulada') && !texto.includes('teste-sem-banco');
  });
}

// Trava em tempo de execução para specs com banco real (defesa extra além do playwright.config.ts)
export function exigirBancoLocal(): void {
  if (!bancoLocal()) throw new Error('Recusado: este teste escreve no banco e só roda com Supabase LOCAL (o .env.local aponta para o banco compartilhado).');
}
