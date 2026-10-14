// E4.1 — utilitários do NAVEGADOR para convites e notificações.

// Pede ao servidor para enviar os e-mails de aviso pendentes (não bloqueia a tela; falha silenciosa — a fila guarda e tenta de novo)
let filaIndisponivel = false; // 503 = fila ainda não existe neste banco: não insiste
export function dispararNotificacoes() {
  if (filaIndisponivel) return;
  fetch('/api/notificacoes/processar', { method: 'POST' }).then((r) => { if (r.status === 503) filaIndisponivel = true; }).catch(() => {});
}

// O token do convite fica só neste navegador (localStorage) entre o link do e-mail, o cadastro e o onboarding
const CHAVE = 'unnify:convite';
export const guardarTokenConvite = (t: string) => { try { localStorage.setItem(CHAVE, t); } catch { /* sem armazenamento */ } };
export const lerTokenConvite = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
export const esquecerTokenConvite = () => { try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } };

export interface DadosConvite {
  sentido: 'contador_para_empresa' | 'empresa_para_contador';
  remetente: string | null;
  escritorio: string | null;
  cnpj_convidado: string | null;
  mensagem: string | null;
  email_mascarado: string;
  situacao: 'pendente' | 'aceito' | 'recusado' | 'cancelado' | 'expirado';
  expira_em: string;
  funcao: string;
  permissoes: string[];
}

export const SITUACAO_CONVITE: Record<string, { texto: string; selo: 'alerta' | 'sucesso' | 'perigo' | 'neutro' }> = {
  pendente: { texto: 'Aguardando resposta', selo: 'alerta' },
  aceito: { texto: 'Aceito', selo: 'sucesso' },
  recusado: { texto: 'Recusado', selo: 'perigo' },
  expirado: { texto: 'Expirado', selo: 'neutro' },
  cancelado: { texto: 'Cancelado', selo: 'neutro' },
};

export function cnpjValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => { const r = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}
export function mascaraCnpj(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

// Envia pela rota do servidor (o token nunca passa pelo navegador de quem convida)
export async function enviarConviteApi(corpo: Record<string, unknown>): Promise<{ ok: true; enviado: boolean } | { ok: false; erro: string }> {
  try {
    const r = await fetch('/api/convites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: j.erro ?? 'Erro ao enviar convite. Tente novamente.' };
    return { ok: true, enviado: !!j.enviado };
  } catch {
    return { ok: false, erro: 'Erro ao enviar convite. Verifique sua conexão.' };
  }
}
