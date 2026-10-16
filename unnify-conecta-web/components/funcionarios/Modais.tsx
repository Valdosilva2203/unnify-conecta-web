'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarMoeda, mascaraMoeda, paraDecimal, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import { VINCULOS, paraPercentual, valorPercentual, type Funcionario, type LinhaFolha, type Vinculo } from '@/lib/funcionarios';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { enviarComprovante } from '@/components/financeiro/FormLancamento';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const Erro = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null);

// Cadastro/edição. Salário novo vale a partir da competência escolhida (competências com pagamento não mudam).
export function ModalFuncionario({ aberto, aoFechar, idEmpresa, funcionario, competencia, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; funcionario: Funcionario | null; competencia: string; aoSalvar: (m: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [admissao, setAdmissao] = useState('');
  const [vinculo, setVinculo] = useState<Vinculo>('clt');
  const [salario, setSalario] = useState('');
  const [dia, setDia] = useState('5');
  const [mesSeguinte, setMesSeguinte] = useState(true);
  const [obs, setObs] = useState('');
  const [vigencia, setVigencia] = useState(competencia.slice(0, 7));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    const f = funcionario;
    setNome(f?.nome ?? ''); setCargo(f?.cargo ?? ''); setAdmissao(f?.data_admissao ?? ''); setVinculo(f?.vinculo ?? 'clt');
    setSalario(f ? valorParaMascara(f.salario_base) : ''); setDia(String(f?.dia_pagamento ?? 5)); setMesSeguinte(f?.pagamento_mes_seguinte ?? true);
    setObs(f?.observacoes ?? ''); setVigencia(competencia.slice(0, 7));
  }, [aberto, funcionario, competencia]);

  const salarioMudou = !!funcionario && paraDecimal(salario) !== null && Number(paraDecimal(salario)) !== Number(funcionario.salario_base);
  const salvar = async () => {
    const valor = paraDecimal(salario);
    if (nome.trim().length < 2) return setErro('Informe o nome.');
    if (!admissao) return setErro('Informe a data de admissão.');
    if (!valor) return setErro('Informe o salário-base.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_funcionario', {
      p_id: funcionario?.id ?? null, p_id_empresa: idEmpresa, p_nome: nome, p_cargo: cargo || null, p_data_admissao: admissao, p_vinculo: vinculo,
      p_salario: valor, p_dia_pagamento: Number(dia), p_mes_seguinte: mesSeguinte, p_observacoes: obs || null,
      p_vigente_desde: salarioMudou ? `${vigencia}-01` : null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o funcionário.'));
    aoSalvar(funcionario ? 'Funcionário atualizado.' : 'Funcionário cadastrado. A previsão do mês já está no Financeiro.');
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={funcionario ? 'Editar funcionário' : 'Novo funcionário'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div><label htmlFor="func-nome" className={rotulo}>Nome</label><input id="func-nome" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="func-cargo" className={rotulo}>Cargo</label><input id="func-cargo" maxLength={80} value={cargo} onChange={(e) => setCargo(e.target.value)} className={campo} /></div>
          <div><label htmlFor="func-vinculo" className={rotulo}>Vínculo</label>
            <select id="func-vinculo" value={vinculo} onChange={(e) => setVinculo(e.target.value as Vinculo)} className={campo}>
              {Object.entries(VINCULOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
          <div><label htmlFor="func-admissao" className={rotulo}>Admissão</label><input id="func-admissao" type="date" value={admissao} onChange={(e) => setAdmissao(e.target.value)} className={campo} /></div>
          <div><label htmlFor="func-salario" className={rotulo}>Salário-base (R$)</label><input id="func-salario" inputMode="numeric" placeholder="0,00" value={salario} onChange={(e) => setSalario(mascaraMoeda(e.target.value))} className={campo} /></div>
          <div><label htmlFor="func-dia" className={rotulo}>Dia de pagamento</label><input id="func-dia" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} className={campo} /></div>
          <label className="flex items-center gap-2 min-h-11 sm:mt-7 cursor-pointer text-sm text-gray-800">
            <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={mesSeguinte} onChange={(e) => setMesSeguinte(e.target.checked)} />Pago no mês seguinte à competência
          </label>
        </div>
        {salarioMudou && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
            <label htmlFor="func-vigencia" className="block text-sm font-semibold text-amber-900">Novo salário vale a partir da competência</label>
            <input id="func-vigencia" type="month" value={vigencia} onChange={(e) => setVigencia(e.target.value)} className={campo} />
            <p className="text-xs text-amber-900">Competências com pagamento registrado não são alteradas.</p>
          </div>
        )}
        <div><label htmlFor="func-obs" className={rotulo}>Observações</label>
          <textarea id="func-obs" rows={2} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
        <p className="text-xs text-gray-500">Controle gerencial: não calcula INSS, FGTS, IRRF, férias ou 13º.</p>
      </div>
    </Modal>
  );
}

// Pagamento integral ou parcial (vira saída efetiva no Financeiro, pela conta escolhida). Comprovante opcional.
export function ModalPagamentoFolha({ linha, aoFechar, idEmpresa, contas, hoje, aoConcluir }: {
  linha: LinhaFolha | null; aoFechar: () => void; idEmpresa: string; contas: ContaFinanceira[]; hoje: string; aoConcluir: (m: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje);
  const [conta, setConta] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ativas = contas.filter((c) => !c.arquivada_em);
  useEffect(() => {
    if (!linha) return;
    setValor(valorParaMascara(Number(linha.pendente))); setData(hoje); setArquivo(null); setErro(null);
    setConta((ativas.find((c) => c.principal) ?? ativas[0])?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linha, hoje]);
  if (!linha) return null;
  const pagar = async () => {
    const v = paraDecimal(valor);
    if (!v) return setErro('Informe o valor.');
    if (Number(v) > Number(linha.pendente)) return setErro(`O valor passa do pendente (${formatarMoeda(linha.pendente)}).`);
    if (!conta) return setErro('Escolha a conta de pagamento.');
    setOcupado(true); setErro(null);
    const { data: idLanc, error } = await createClient().rpc('registrar_pagamento_folha', { p_id_folha: linha.id_folha, p_valor: v, p_data: data, p_id_conta: conta });
    if (error) { setOcupado(false); return setErro(mensagemDeErro(error, 'Não foi possível registrar o pagamento.')); }
    let aviso = Number(v) < Number(linha.pendente) ? 'Pagamento parcial registrado.' : 'Pagamento registrado.';
    if (arquivo && idLanc) {
      const falhaAnexo = await enviarComprovante(idEmpresa, idLanc as string, arquivo);
      if (falhaAnexo) aviso += ` Comprovante não anexado: ${falhaAnexo}`;
    }
    setOcupado(false);
    aoConcluir(aviso);
  };
  return (
    <Modal aberto={!!linha} aoFechar={aoFechar} titulo="Registrar pagamento" descricao={`${linha.nome} · pendente ${formatarMoeda(linha.pendente)}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={pagar}>{ocupado ? 'Registrando...' : 'Confirmar pagamento'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="pag-valor" className={rotulo}>Valor (R$)</label><input id="pag-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className={campo} /></div>
          <div><label htmlFor="pag-data" className={rotulo}>Data do pagamento</label><input id="pag-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
        </div>
        <div><label htmlFor="pag-conta" className={rotulo}>Conta</label>
          <select id="pag-conta" value={conta} onChange={(e) => setConta(e.target.value)} className={campo}>
            <option value="">Selecione</option>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome} · {formatarMoeda(c.saldo)}</option>)}</select>
          {ativas.length === 0 && <p className="text-xs text-red-700 mt-1">Cadastre uma conta em Financeiro → Contas e bancos.</p>}</div>
        <div><label htmlFor="pag-comprovante" className={rotulo}>Comprovante (opcional)</label>
          <input id="pag-comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></div>
        <p className="text-xs text-gray-500">Valor menor que o pendente = pagamento parcial; o restante continua previsto no Financeiro.</p>
      </div>
    </Modal>
  );
}

export function ModalAjuste({ linha, aoFechar, aoConcluir }: { linha: LinhaFolha | null; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [tipo, setTipo] = useState<'adicional' | 'desconto'>('adicional');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [calculo, setCalculo] = useState<'fixo' | 'percentual'>('fixo');
  const [percentual, setPercentual] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (linha) { setTipo('adicional'); setDescricao(''); setValor(''); setCalculo('fixo'); setPercentual(''); setErro(null); } }, [linha]);
  if (!linha) return null;
  const base = Number(linha.salario_base);
  const pct = paraPercentual(percentual);
  const calculado = pct && base > 0 ? valorPercentual(base, pct) : null;
  const fixo = paraDecimal(valor);
  const valorFinal = calculo === 'fixo' ? (fixo ? Number(fixo) : null) : calculado;
  const salvar = async () => {
    if (descricao.trim().length < 2) return setErro('Descreva o ajuste.');
    if (calculo === 'fixo' && !fixo) return setErro('Informe o valor.');
    if (calculo === 'percentual') {
      if (!pct) return setErro('Informe uma porcentagem maior que zero (até 4 casas decimais).');
      if (!(base > 0)) return setErro('Salário-base inválido para o cálculo.');
      if (tipo === 'desconto' && Number(pct) > 100) return setErro('Um desconto percentual não pode passar de 100% do salário-base.');
      if (!calculado || calculado <= 0) return setErro('O valor calculado ficou em R$ 0,00: aumente a porcentagem.');
    }
    setOcupado(true); setErro(null);
    // Percentual: só a porcentagem vai ao banco; base e valor são calculados lá com o salário gravado na competência
    const { error } = calculo === 'fixo'
      ? await createClient().rpc('adicionar_ajuste_folha', { p_id_folha: linha.id_folha, p_tipo: tipo, p_descricao: descricao, p_valor: fixo })
      : await createClient().rpc('adicionar_ajuste_percentual_folha', { p_id_folha: linha.id_folha, p_tipo: tipo, p_descricao: descricao, p_percentual: pct });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o ajuste.'));
    aoConcluir(tipo === 'adicional' ? 'Adicional lançado; a previsão foi atualizada.' : 'Desconto lançado; a previsão foi atualizada.');
  };
  return (
    <Modal aberto={!!linha} aoFechar={aoFechar} titulo="Adicional ou desconto" descricao={linha.nome}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Tipo" className="flex gap-2">
          {(['adicional', 'desconto'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
              className={`flex-1 min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? (t === 'adicional' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-gray-200 text-gray-600'}`}>
              {t === 'adicional' ? 'Adicional' : 'Desconto'}</button>
          ))}
        </div>
        <div><label htmlFor="aj-desc" className={rotulo}>Descrição</label><input id="aj-desc" maxLength={120} placeholder="Ex.: Hora extra, vale" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} /></div>
        <div><label htmlFor="aj-calculo" className={rotulo}>Tipo de cálculo</label>
          <select id="aj-calculo" value={calculo} onChange={(e) => { setCalculo(e.target.value as 'fixo' | 'percentual'); setErro(null); }} className={campo}>
            <option value="fixo">Valor fixo (R$)</option>
            <option value="percentual">Porcentagem (%)</option>
          </select></div>
        {calculo === 'fixo' ? (
          <div><label htmlFor="aj-valor" className={rotulo}>Valor (R$)</label><input id="aj-valor" inputMode="numeric" placeholder="0,00" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className={campo} /></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label htmlFor="aj-base" className={rotulo}>Base de cálculo</label>
              <select id="aj-base" className={campo} defaultValue="salario_base">
                <option value="salario_base">Salário-base ({formatarMoeda(base)})</option>
              </select></div>
            <div><label htmlFor="aj-percentual" className={rotulo}>Porcentagem (%)</label>
              <input id="aj-percentual" inputMode="decimal" placeholder="Ex.: 7,5" value={percentual} onChange={(e) => setPercentual(e.target.value.replace(/[^\d,]/g, ''))} className={campo} /></div>
            <p className="sm:col-span-2 text-xs text-gray-500">Lançamento manual: não calcula INSS, IRRF, FGTS nem horas extras legais.</p>
          </div>
        )}
        {valorFinal !== null && valorFinal > 0 && (
          <div data-testid="previa-ajuste" className={`rounded-xl border px-4 py-3 text-sm ${tipo === 'adicional' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <p className="font-semibold">{tipo === 'adicional' ? 'Valor do adicional: + ' : 'Valor do desconto: − '}{formatarMoeda(valorFinal)}</p>
            {calculo === 'percentual' && pct && <p className="text-xs mt-0.5">{pct.replace('.', ',')}% sobre {formatarMoeda(base)}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ModalDesligar({ funcionario, aoFechar, hoje, aoConcluir }: { funcionario: Funcionario | null; aoFechar: () => void; hoje: string; aoConcluir: (m: string) => void }) {
  const [data, setData] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (funcionario) { setData(hoje); setErro(null); } }, [funcionario, hoje]);
  if (!funcionario) return null;
  const confirmar = async () => {
    const { error } = await createClient().rpc('desligar_funcionario', { p_id: funcionario.id, p_data: data });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível desligar.'));
    aoConcluir('Funcionário desligado. Previsões de competências futuras foram removidas; o histórico foi mantido.');
  };
  return (
    <Modal aberto={!!funcionario} aoFechar={aoFechar} titulo="Desligar funcionário" descricao={funcionario.nome}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} onClick={confirmar}>Desligar</button></>}>
      <div className="space-y-3">
        <Erro texto={erro} />
        <label htmlFor="desl-data" className={rotulo}>Data de desligamento</label>
        <input id="desl-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
        <p className="text-xs text-gray-500">Pagamentos já registrados e a competência do desligamento permanecem.</p>
      </div>
    </Modal>
  );
}
