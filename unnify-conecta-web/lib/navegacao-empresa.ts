// Navegação do Portal da Empresa (/app): departamentos no menu lateral e, em cada um, os módulos REAIS já existentes.
// Nada aqui cria rota nem permissão: só agrupa as páginas que já existem. Marketing é um departamento reservado (sem módulos).
import {
  BarChart3, Box, Briefcase, Calculator, CalendarDays, ClipboardList, DollarSign, Folder, HeartPulse, Home, Landmark, ListChecks, Megaphone, Receipt,
  Clock, ShoppingBag, ShoppingCart, Store, UserCheck, UserCog, Users, AlertCircle, Pencil, Wallet, type LucideIcon,
} from 'lucide-react';
import type { ModuloNav } from '@/components/navegacao/NavegacaoModulos';

export interface Departamento { id: string; rotulo: string; icone: LucideIcon; href: string | null; modulos: ModuloNav[] }

export const DEPARTAMENTOS: Departamento[] = [
  { id: 'inicio', rotulo: 'Início', icone: Home, href: '/app', modulos: [] },
  { id: 'administrativo', rotulo: 'Administrativo', icone: ClipboardList, href: '/app/tarefas', modulos: [
    { href: '/app/tarefas', rotulo: 'Tarefas', icone: ListChecks }, { href: '/app/anotacoes', rotulo: 'Anotações', icone: Pencil }, { href: '/app/agenda', rotulo: 'Agenda', icone: CalendarDays },
    { href: '/app/minha-conta', rotulo: 'Minha conta', icone: UserCog },
  ] },
  { id: 'financeiro', rotulo: 'Financeiro', icone: DollarSign, href: '/app/financeiro', modulos: [
    { href: '/app/financeiro', rotulo: 'Financeiro', icone: DollarSign }, { href: '/app/recibos', rotulo: 'Recibos', icone: Receipt }, { href: '/app/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
  ] },
  { id: 'rh', rotulo: 'Recursos Humanos', icone: Users, href: '/app/funcionarios', modulos: [
    { href: '/app/funcionarios', rotulo: 'Funcionários', icone: Users }, { href: '/app/folha-pagamento', rotulo: 'Folha de Pagamento', icone: Wallet },
    { href: '/app/ponto', rotulo: 'Controle de Ponto', icone: Clock },
  ] },
  { id: 'comercial', rotulo: 'Comercial', icone: Store, href: '/app/clientes', modulos: [
    { href: '/app/clientes', rotulo: 'Clientes', icone: UserCheck }, { href: '/app/vendas', rotulo: 'Vendas', icone: ShoppingBag },
  ] },
  { id: 'marketing', rotulo: 'Marketing', icone: Megaphone, href: null, modulos: [] }, // reservado: sem rotas nem módulos
  { id: 'compras-estoque', rotulo: 'Compras e Estoque', icone: ShoppingCart, href: '/app/compras', modulos: [
    { href: '/app/compras', rotulo: 'Compras', icone: ShoppingCart }, { href: '/app/estoque', rotulo: 'Estoque', icone: Box },
  ] },
  { id: 'contabilidade', rotulo: 'Contabilidade e Obrigações', icone: Calculator, href: '/app/meu-contador', modulos: [
    { href: '/app/meu-contador', rotulo: 'Meu contador', icone: Briefcase }, { href: '/app/documentos', rotulo: 'Documentos', icone: Folder },
    { href: '/app/obrigacoes', rotulo: 'Obrigações', icone: AlertCircle },
    { href: '/app/impostos', rotulo: 'Impostos', icone: Landmark }, { href: '/app/saude-empresarial', rotulo: 'Saúde Empresarial', icone: HeartPulse },
  ] },
];

const naRota = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// Departamento da rota atual (o dashboard /app é o Início; rotas desconhecidas não destacam nenhum)
export function departamentoDaRota(pathname: string | null): Departamento | null {
  if (!pathname) return null;
  if (pathname === '/app') return DEPARTAMENTOS[0];
  return DEPARTAMENTOS.find((d) => d.modulos.some((m) => naRota(pathname, m.href))) ?? null;
}

export const modulosDaRotaEmpresa = (pathname: string): ModuloNav[] => departamentoDaRota(pathname)?.modulos ?? [];
