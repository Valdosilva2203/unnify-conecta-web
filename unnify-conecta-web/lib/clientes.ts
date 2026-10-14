// Clientes (Etapa 1) — tipos, rótulos, máscaras e validação no navegador (o banco valida de novo em salvar_cliente).
import { cnpjValido, mascaraCnpj } from './convites';

export type StatusCliente = 'prospect' | 'ativo' | 'inativo';
export type SituacaoFinanceira = 'em_dia' | 'pendente' | 'atrasado' | 'sem_movimento';

export interface Cliente {
  id: string;
  tipo_pessoa: 'pf' | 'pj';
  nome: string;
  nome_fantasia: string | null;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  status: StatusCliente;
  criado_em: string;
  situacao_financeira: SituacaoFinanceira | null;
  a_receber: number | null;
  total_recebido: number | null;
  ultimo_movimento: string | null;
  total: number;
}
export interface ClienteCompleto extends Omit<Cliente, 'situacao_financeira' | 'a_receber' | 'total_recebido' | 'ultimo_movimento' | 'total'> {
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; observacoes: string | null;
}

export const STATUS_CLIENTE: Record<StatusCliente, { rotulo: string; selo: 'sucesso' | 'neutro' | 'info' }> = {
  ativo: { rotulo: 'Ativo', selo: 'sucesso' },
  inativo: { rotulo: 'Inativo', selo: 'neutro' },
  prospect: { rotulo: 'Prospect', selo: 'info' },
};
export const SITUACAO_FIN: Record<SituacaoFinanceira, { rotulo: string; selo: 'sucesso' | 'alerta' | 'perigo' | 'neutro' }> = {
  em_dia: { rotulo: 'Em dia', selo: 'sucesso' },
  pendente: { rotulo: 'A receber', selo: 'alerta' },
  atrasado: { rotulo: 'Em atraso', selo: 'perigo' },
  sem_movimento: { rotulo: 'Sem movimento', selo: 'neutro' },
};

export function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export const documentoValido = (tipo: 'pf' | 'pj', valor: string) => (tipo === 'pf' ? cpfValido(valor) : cnpjValido(valor));
export const mascaraCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
export const mascaraDocumento = (tipo: 'pf' | 'pj', v: string) => (tipo === 'pf' ? mascaraCpf(v) : mascaraCnpj(v));
export function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.length <= 10 ? d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2') : d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
export const mascaraCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
export const iniciaisCliente = (nome: string) => nome.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || nome.slice(0, 2).toUpperCase();
