import { test, expect } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Parcelamentos — editar contrato selecionado, com a API do Supabase SIMULADA (não acessa banco).
// Regras de banco (o que muda, parcelas pagas preservadas, permissões) em tests/sql/editar-contrato.mjs.
const BASE = 'http://localhost:3000';
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const CAT1 = { id: 'c1', tipo: 'despesa', nome: 'Compra de Equipamentos', cor: '#22c55e', icone: 'box', ativa: true };
const CAT2 = { id: 'c2', tipo: 'despesa', nome: 'Tecnologia', cor: '#3b82f6', icone: 'tag', ativa: true };
const CONTA = { id: 'k1', nome: 'Sicredi', instituicao: null, tipo: 'conta_corrente', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', principal: true, permite_saldo_negativo: false, arquivada_em: null, saldo: 3600.59, cor: null };
const CONTRATO = { id: 'ct1', id_empresa: EMPRESA.id, nome: 'Nº 13977', tipo: 'compra_parcelada', contraparte: 'Digital conect', id_categoria: 'c1', categoria_nome: 'Compra de Equipamentos',
  categoria_cor: '#22c55e', categoria_icone: 'box', descricao: null, data_contratacao: '2026-09-11', valor_principal: 1082.7, valor_total: 1082.7, taxa_juros_mensal: null, modalidade: 'fixas',
  id_conta_financeira: null, conta_nome: null, cancelado_em: null, motivo_cancelamento: null, qtd_parcelas: 3, qtd_pagas: 1, qtd_atrasadas: 0, valor_pago: 360.9, saldo_devedor: 721.8,
  proximo_vencimento: '2026-11-11', valor_proxima: 360.9, juros_previstos: 0, tem_entrada: false, situacao: 'ativo', percentual_quitado: 33.3 };

test('contrato selecionado: botão Editar abre o formulário com os dados atuais e salva pelo banco', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rotas: Rotas = (c) => {
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'categorias_financeiras') return { corpo: [CAT1, CAT2] };
    if (c === 'contas_financeiras_saldo') return { corpo: [CONTA] };
    if (c === 'contratos_parcelados_resumo') return { corpo: [CONTRATO], total: 1 };
    if (c === 'rpc/resumo_parcelamentos') return { corpo: { contratos_ativos: 1, saldo_devedor_total: 721.8, parcelas_pagas: 1, parcelas_em_atraso: 0 } };
    if (c === 'rpc/atualizar_contrato_parcelado') return { corpo: null };
    if (c === 'rpc/convites_enviados' || c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
  const registro = await sessaoSimulada(ctx, rotas);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/financeiro#parcelamentos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Financeiro' })).toBeVisible({ timeout: 90000 });
  await page.getByText('Nº 13977').first().click();
  const detalhe = page.getByRole('region', { name: 'Detalhes de Nº 13977' });
  await detalhe.getByRole('button', { name: 'Editar' }).click();
  const modal = page.getByRole('dialog', { name: 'Editar contrato' });
  await expect(modal.getByLabel('Nome do contrato')).toHaveValue('Nº 13977');
  await expect(modal.getByLabel('Fornecedor')).toHaveValue('Digital conect');
  await modal.getByLabel('Nome do contrato').fill('Nº 13977 — Notebooks');
  await modal.getByLabel('Categoria').selectOption('c2');
  await modal.getByLabel('Conta de pagamento').selectOption('k1');
  await modal.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect.poll(() => registro.chamadas.filter((x) => x.caminho === 'rpc/atualizar_contrato_parcelado').length).toBe(1);
  expect(registro.chamadas.find((x) => x.caminho === 'rpc/atualizar_contrato_parcelado')!.corpo).toMatchObject({
    p_id: 'ct1', p_nome: 'Nº 13977 — Notebooks', p_contraparte: 'Digital conect', p_id_categoria: 'c2', p_id_conta_financeira: 'k1' });
  await expect(modal).toHaveCount(0);
  for (const largura of [320, 768]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await detalhe.getByRole('button', { name: 'Editar' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape'); // em 320px o indicador do Next (só em dev) cobre o botão Cancelar
    await expect(page.getByRole('dialog', { name: 'Editar contrato' })).toHaveCount(0);
  }
  await ctx.close();
});
