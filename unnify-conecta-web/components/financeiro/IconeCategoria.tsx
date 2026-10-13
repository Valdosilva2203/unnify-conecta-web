import {
  Banknote, Briefcase, Building2, Bus, Calculator, Car, Coffee, CreditCard, Droplets, FileText, Fuel, Gift, GraduationCap,
  HeartPulse, House, Landmark, Laptop, Megaphone, Package, Phone, PiggyBank, Plane, Receipt, Scale, ShieldCheck, Shirt,
  ShoppingCart, Store, Tag, TrendingUp, Truck, Users, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import { corSobre } from '@/lib/cores';

// Catálogo FIXO de ícones de categoria (mesma lista de public.icones_categoria_permitidos() no banco).
// O usuário escolhe um identificador; nenhum SVG/HTML enviado por ele é renderizado.
export const ICONES_CATEGORIA: { id: string; Icone: LucideIcon; nome: string; termos: string }[] = [
  { id: 'tag', Icone: Tag, nome: 'Etiqueta', termos: 'padrão geral outros' },
  { id: 'house', Icone: House, nome: 'Casa', termos: 'aluguel imóvel moradia condomínio' },
  { id: 'zap', Icone: Zap, nome: 'Energia', termos: 'luz elétrica eletricidade' },
  { id: 'wifi', Icone: Wifi, nome: 'Internet', termos: 'wi-fi rede conexão' },
  { id: 'phone', Icone: Phone, nome: 'Telefone', termos: 'celular telefonia' },
  { id: 'droplets', Icone: Droplets, nome: 'Água', termos: 'saneamento água esgoto' },
  { id: 'utensils', Icone: Utensils, nome: 'Alimentação', termos: 'comida restaurante refeição' },
  { id: 'coffee', Icone: Coffee, nome: 'Café', termos: 'lanche copa' },
  { id: 'car', Icone: Car, nome: 'Veículo', termos: 'carro transporte' },
  { id: 'bus', Icone: Bus, nome: 'Transporte', termos: 'ônibus vale-transporte locomoção' },
  { id: 'fuel', Icone: Fuel, nome: 'Combustível', termos: 'gasolina posto' },
  { id: 'plane', Icone: Plane, nome: 'Viagem', termos: 'passagem avião hospedagem' },
  { id: 'users', Icone: Users, nome: 'Funcionários', termos: 'salários folha equipe pessoal' },
  { id: 'landmark', Icone: Landmark, nome: 'Impostos', termos: 'tributos governo taxas banco' },
  { id: 'calculator', Icone: Calculator, nome: 'Contabilidade', termos: 'contador honorários' },
  { id: 'scale', Icone: Scale, nome: 'Jurídico', termos: 'advogado justiça' },
  { id: 'truck', Icone: Truck, nome: 'Fornecedores', termos: 'frete entrega compras logística' },
  { id: 'package', Icone: Package, nome: 'Estoque', termos: 'produtos mercadorias embalagem' },
  { id: 'megaphone', Icone: Megaphone, nome: 'Marketing', termos: 'publicidade anúncios propaganda' },
  { id: 'shopping-cart', Icone: ShoppingCart, nome: 'Vendas', termos: 'venda produtos compras' },
  { id: 'store', Icone: Store, nome: 'Loja', termos: 'comércio ponto' },
  { id: 'briefcase', Icone: Briefcase, nome: 'Serviços', termos: 'prestação consultoria trabalho' },
  { id: 'heart-pulse', Icone: HeartPulse, nome: 'Saúde', termos: 'plano médico farmácia' },
  { id: 'graduation-cap', Icone: GraduationCap, nome: 'Educação', termos: 'curso treinamento escola' },
  { id: 'laptop', Icone: Laptop, nome: 'Tecnologia', termos: 'software sistema computador' },
  { id: 'wrench', Icone: Wrench, nome: 'Manutenção', termos: 'reparo conserto ferramentas' },
  { id: 'shirt', Icone: Shirt, nome: 'Vestuário', termos: 'uniforme roupas' },
  { id: 'gift', Icone: Gift, nome: 'Presentes', termos: 'brindes doações' },
  { id: 'shield-check', Icone: ShieldCheck, nome: 'Seguros', termos: 'seguro proteção' },
  { id: 'building', Icone: Building2, nome: 'Empresa', termos: 'escritório prédio condomínio' },
  { id: 'file-text', Icone: FileText, nome: 'Documentos', termos: 'cartório certidões papelaria' },
  { id: 'receipt', Icone: Receipt, nome: 'Recibos', termos: 'notas contas boletos' },
  { id: 'wallet', Icone: Wallet, nome: 'Carteira', termos: 'dinheiro outras receitas' },
  { id: 'banknote', Icone: Banknote, nome: 'Dinheiro', termos: 'pagamento espécie' },
  { id: 'credit-card', Icone: CreditCard, nome: 'Cartão', termos: 'cartão de crédito tarifas' },
  { id: 'piggy-bank', Icone: PiggyBank, nome: 'Poupança', termos: 'reserva economia' },
  { id: 'trending-up', Icone: TrendingUp, nome: 'Investimentos', termos: 'rendimentos juros aplicações' },
];

const POR_ID = new Map(ICONES_CATEGORIA.map((i) => [i.id, i]));
export const ICONE_PADRAO = 'tag';

// Ícone da categoria num círculo com a cor da categoria. Identificador desconhecido → ícone padrão.
export function IconeCategoria({ icone, cor, tamanho = 'md', className = '' }: { icone?: string | null; cor: string; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const item = POR_ID.get(icone ?? '') ?? POR_ID.get(ICONE_PADRAO)!;
  const { Icone } = item;
  const caixa = { sm: 'w-6 h-6', md: 'w-9 h-9', lg: 'w-12 h-12' }[tamanho];
  const simbolo = { sm: 'w-3.5 h-3.5', md: 'w-4.5 h-4.5', lg: 'w-6 h-6' }[tamanho];
  return (
    <span data-icone={item.id} className={`shrink-0 rounded-full inline-flex items-center justify-center ${caixa} ${className}`} style={{ backgroundColor: cor, color: corSobre(cor) }} aria-hidden="true">
      <Icone className={simbolo} />
    </span>
  );
}
