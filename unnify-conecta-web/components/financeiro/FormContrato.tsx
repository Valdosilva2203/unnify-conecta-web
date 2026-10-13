'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara,
  type Categoria, type ContaFinanceira,
} from '@/lib/financeiro';
import { TIPOS_CONTRATO, centavos, ehFinanciamento, type ParcelaPrevia, type TipoContrato } from '@/lib/parcelamentos';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  idEmpresa: string;
  categorias: Categoria[];
  contas: ContaFinanceira[];
  aoCriar: (mensagem: string, idContrato: string) => void;
}

export function FormContrato({ aberto, aoFechar, idEmpresa, categorias, contas, aoCriar }: Props) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoContrato>('compra_parcelada');
  const [contraparte, setContraparte] = useState('');
  const [idCategoria, setIdCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataContratacao, setDataContratacao] = useState('');
  const [primeira, setPrimeira] = useState('');
  const [quantidade, setQuantidade] = useState('12');
  const [principal, setPrincipal] = useState('');
  const [total, setTotal] = useState('');
  const [comEntrada, setComEntrada] = useState(false);
  const [entrada, setEntrada] = useState('');
  const [vencEntrada, setVencEntrada] = useState('');
  const [modalidade, setModalidade] = useState<'fixas' | 'personalizadas'>('fixas');
  const [juros, setJuros] = useState('');
  const [idConta, setIdConta] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaPrevia[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const travado = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    const hoje = hojeBrasil();
    setEtapa(1);
    setNome('');
    setTipo('compra_parcelada');
    setContraparte('');
    setIdCategoria('');
    setDescricao('');
    setDataContratacao(hoje);
    setPrimeira(hoje);
    setQuantidade('12');
    setPrincipal('');
    setTotal('');
    setComEntrada(false);
    setEntrada('');
    setVencEntrada(hoje);
    setModalidade('fixas');
    setJuros('');
    setIdConta('');
    setArquivo(null);
    setParcelas([]);
    setErro(null);
  }, [aberto]);

  const financiamento = ehFinanciamento(tipo);
  const totalDec = paraDecimal(total);
  const entradaDec = comEntrada ? paraDecimal(entrada) : null;
  const somaCentavos = parcelas.reduce((s, p) => s + centavos(paraDecimal(p.valor)), 0) + centavos(entradaDec);
  const diferenca = centavos(totalDec) - somaCentavos;

  // Etapa 1 → 2: valida e pede a prévia determinística ao servidor
  const avancar = async () => {
    setErro(null);
    const qtd = Number(quantidade);
    if (nome.trim().length < 2) return setErro('Informe o nome do contrato.');
    if (!idCategoria) return setErro('Escolha a categoria.');
    if (!dataContratacao || !primeira) return setErro('Informe as datas de contratação e da primeira parcela.');
    if (primeira < dataContratacao) return setErro('A primeira parcela deve ser a partir da data de contratação.');
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 360) return setErro('Quantidade de parcelas: de 1 a 360.');
    if (!paraDecimal(principal) || !totalDec) return setErro('Informe o valor principal e o valor total previsto.');
    if (centavos(paraDecimal(principal)) > centavos(totalDec)) return setErro('O valor principal não pode ser maior que o total previsto.');
    if (comEntrada && (!entradaDec || !vencEntrada)) return setErro('Informe o valor e o vencimento da entrada.');
    if (comEntrada && centavos(entradaDec) >= centavos(totalDec)) return setErro('A entrada deve ser menor que o valor total.');
    setOcupado(true);
    const { data, error } = await createClient().rpc('simular_parcelas_fixas', {
      p_valor_total: totalDec, p_entrada: entradaDec ?? 0, p_quantidade: qtd, p_primeira: primeira,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível calcular as parcelas.'));
    setParcelas((data as { numero: number; vencimento: string; valor: number }[]).map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: valorParaMascara(p.valor), juros: '' })));
    setEtapa(2);
  };

  const alterarParcela = (i: number, campoParcela: keyof ParcelaPrevia, valor: string) =>
    setParcelas((lista) => lista.map((p, j) => (j === i ? { ...p, [campoParcela]: campoParcela === 'vencimento' ? valor : mascaraMoeda(valor) } : p)));

  const confirmar = async () => {
    if (travado.current) return;
    setErro(null);
    if (diferenca !== 0) return setErro('A soma da entrada e das parcelas precisa ser igual ao valor total previsto.');
    if (arquivo && (!ARQUIVOS_COMPROVANTE.includes(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE)) return setErro('Anexo: PDF, JPG, PNG ou WebP até 10 MB.');
    travado.current = true;
    setOcupado(true);
    const supabase = createClient();
    const { data: idContrato, error } = await supabase.rpc('criar_contrato_parcelado', {
      p_id_empresa: idEmpresa,
      p_nome: nome.trim(),
      p_tipo: tipo,
      p_contraparte: contraparte.trim() || null,
      p_id_categoria: idCategoria,
      p_descricao: descricao.trim() || null,
      p_data_contratacao: dataContratacao,
      p_valor_principal: paraDecimal(principal),
      p_valor_total: totalDec,
      p_taxa_juros: financiamento && juros.trim() ? juros.replace(',', '.') : null,
      p_modalidade: modalidade,
      p_id_conta_financeira: idConta || null,
      p_entrada: comEntrada ? { valor: entradaDec, vencimento: vencEntrada } : null,
      p_parcelas: parcelas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: paraDecimal(p.valor), juros: financiamento && p.juros ? paraDecimal(p.juros) : null })),
    });
    let aviso = '';
    if (!error && arquivo && idContrato) {
      const extensao = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[arquivo.type];
      const caminho = `${idEmpresa}/contratos/${idContrato}/${crypto.randomUUID()}.${extensao}`;
      const envio = await supabase.storage.from('comprovantes-financeiros').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      const registro = envio.error ? envio : await supabase.rpc('registrar_anexo_contrato', { p_id_contrato: idContrato, p_caminho: caminho, p_nome_arquivo: arquivo.name });
      if (registro.error) aviso = ' Atenção: não foi possível anexar o arquivo.';
    }
    travado.current = false;
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível criar o contrato.'));
    aoCriar(`Contrato criado com ${parcelas.length} parcela${parcelas.length > 1 ? 's' : ''}.${aviso}`, idContrato as string);
  };

  const categoriasDespesa = categorias.filter((c) => c.tipo === 'despesa' && c.ativa);

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={etapa === 1 ? 'Novo contrato' : 'Confira as parcelas'}
      descricao={etapa === 1 ? 'Etapa 1 de 2 · Dados do contrato' : 'Etapa 2 de 2 · Nada é gravado antes de confirmar'}
      rodape={
        etapa === 1 ? (
          <>
            <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
            <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={avancar}>{ocupado ? 'Calculando...' : 'Gerar parcelas'}</button>
          </>
        ) : (
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setEtapa(1)}><ArrowLeft className="w-4 h-4" aria-hidden="true" />Voltar</button>
            <button type="button" className={classeBotaoPrimario} disabled={ocupado || diferenca !== 0} onClick={confirmar}>{ocupado ? 'Criando...' : 'Criar contrato'}</button>
          </>
        )
      }
    >
      {etapa === 1 ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="contrato-nome" className={rotulo}>Nome do contrato</label>
            <input id="contrato-nome" maxLength={120} className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Financiamento do carro" />
          </div>
          <fieldset>
            <legend className={rotulo}>Tipo de parcelamento</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(Object.keys(TIPOS_CONTRATO) as TipoContrato[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
                  className={`min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {TIPOS_CONTRATO[t]}
                </button>
              ))}
            </div>
          </fieldset>
          {financiamento && (
            <p className="text-xs text-gray-600 rounded-lg bg-blue-50 border border-blue-100 p-2.5">
              Parcelas de {TIPOS_CONTRATO[tipo].toLowerCase()} não entram como despesa operacional: aparecem à parte no Financeiro. Informe os juros de cada parcela, se souber.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contrato-contraparte" className={rotulo}>{financiamento ? 'Instituição' : 'Fornecedor'} <span className="font-normal text-gray-500">(opcional)</span></label>
              <input id="contrato-contraparte" maxLength={120} className={campo} value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
            </div>
            <div>
              <label htmlFor="contrato-categoria" className={rotulo}>Categoria</label>
              <select id="contrato-categoria" className={campo} value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)}>
                <option value="">Selecione</option>
                {categoriasDespesa.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contrato-principal" className={rotulo}>Valor principal (R$)</label>
              <input id="contrato-principal" inputMode="numeric" className={campo} value={principal} onChange={(e) => setPrincipal(mascaraMoeda(e.target.value))} placeholder="0,00" />
            </div>
            <div>
              <label htmlFor="contrato-total" className={rotulo}>Valor total previsto (R$)</label>
              <input id="contrato-total" inputMode="numeric" className={campo} value={total} onChange={(e) => setTotal(mascaraMoeda(e.target.value))} placeholder="0,00" />
            </div>
          </div>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <div>
              <label htmlFor="contrato-data" className={rotulo}>Contratação</label>
              <input id="contrato-data" type="date" className={campo} value={dataContratacao} onChange={(e) => setDataContratacao(e.target.value)} />
            </div>
            <div>
              <label htmlFor="contrato-primeira" className={rotulo}>1ª parcela</label>
              <input id="contrato-primeira" type="date" className={campo} value={primeira} onChange={(e) => setPrimeira(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="contrato-quantidade" className={rotulo}>Quantidade de parcelas</label>
              <input id="contrato-quantidade" inputMode="numeric" className={campo} value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-3 space-y-3">
            <label className="flex w-fit items-center gap-2 min-h-11 text-sm text-gray-800 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={comEntrada} onChange={(e) => setComEntrada(e.target.checked)} />
              Tem entrada
            </label>
            {comEntrada && (
              <div className="grid gap-4 grid-cols-2">
                <div>
                  <label htmlFor="contrato-entrada" className={rotulo}>Valor da entrada (R$)</label>
                  <input id="contrato-entrada" inputMode="numeric" className={campo} value={entrada} onChange={(e) => setEntrada(mascaraMoeda(e.target.value))} placeholder="0,00" />
                </div>
                <div>
                  <label htmlFor="contrato-venc-entrada" className={rotulo}>Vencimento da entrada</label>
                  <input id="contrato-venc-entrada" type="date" className={campo} value={vencEntrada} onChange={(e) => setVencEntrada(e.target.value)} />
                </div>
                <p className="col-span-2 text-xs text-gray-500">A entrada vira uma obrigação a pagar: nenhuma conta é debitada sem você registrar o pagamento.</p>
              </div>
            )}
          </div>
          <fieldset>
            <legend className={rotulo}>Modalidade</legend>
            <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1" role="radiogroup">
              {(['fixas', 'personalizadas'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={modalidade === m} onClick={() => setModalidade(m)}
                  className={`min-h-10 rounded-md text-sm font-semibold ${modalidade === m ? 'bg-white shadow-sm text-orange-700' : 'text-gray-600'}`}>
                  {m === 'fixas' ? 'Parcelas fixas' : 'Parcelas personalizadas'}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {financiamento && (
              <div>
                <label htmlFor="contrato-juros" className={rotulo}>Taxa de juros (% a.m.) <span className="font-normal text-gray-500">(opcional)</span></label>
                <input id="contrato-juros" inputMode="decimal" className={campo} value={juros} onChange={(e) => setJuros(e.target.value.replace(/[^\d,]/g, '').slice(0, 7))} placeholder="1,49" />
              </div>
            )}
            <div>
              <label htmlFor="contrato-conta" className={rotulo}>Conta de pagamento <span className="font-normal text-gray-500">(opcional)</span></label>
              <select id="contrato-conta" className={campo} value={idConta} onChange={(e) => setIdConta(e.target.value)}>
                <option value="">Não definir</option>
                {contas.filter((c) => !c.arquivada_em).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="contrato-descricao" className={rotulo}>Observações <span className="font-normal text-gray-500">(opcional)</span></label>
            <textarea id="contrato-descricao" rows={2} maxLength={1000} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div>
            <label htmlFor="contrato-arquivo" className="inline-flex items-center gap-2 min-h-11 text-sm text-gray-700 cursor-pointer">
              <Paperclip className="w-4 h-4" aria-hidden="true" />{arquivo ? arquivo.name : 'Anexar contrato (opcional)'}
            </label>
            <input id="contrato-arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-gray-500 text-xs">Valor total previsto</p><p className="font-bold text-gray-900">{formatarMoeda(totalDec)}</p></div>
            <div className={`rounded-lg p-2.5 ${diferenca === 0 ? 'bg-green-50' : 'bg-red-50'}`} data-testid="soma-parcelas">
              <p className="text-gray-500 text-xs">Entrada + parcelas</p>
              <p className={`font-bold ${diferenca === 0 ? 'text-green-700' : 'text-red-700'}`}>{formatarMoeda(somaCentavos / 100)}</p>
              {diferenca !== 0 && <p className="text-xs text-red-700">{diferenca > 0 ? 'Faltam' : 'Sobram'} {formatarMoeda(Math.abs(diferenca) / 100)}</p>}
            </div>
          </div>
          {comEntrada && <p className="text-sm text-gray-700">Entrada: <strong>{formatarMoeda(entradaDec)}</strong> com vencimento em {vencEntrada.split('-').reverse().join('/')}</p>}
          {modalidade === 'fixas' && <p className="text-xs text-gray-500">Parcelas iguais; centavos que sobrarem da divisão ficam na última. Para mudar valores ou datas, volte e escolha “Parcelas personalizadas”.</p>}
          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-600">
                  <th className="px-2 py-2 w-10">Nº</th><th className="px-2 py-2">Vencimento</th><th className="px-2 py-2">Valor</th>
                  {financiamento && <th className="px-2 py-2">Juros</th>}
                </tr>
              </thead>
              <tbody>
                {parcelas.map((p, i) => (
                  <tr key={p.numero} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-gray-500">{p.numero}</td>
                    <td className="px-2 py-1.5">
                      {modalidade === 'personalizadas'
                        ? <input type="date" aria-label={`Vencimento da parcela ${p.numero}`} value={p.vencimento} onChange={(e) => alterarParcela(i, 'vencimento', e.target.value)} className="w-full min-w-0 h-10 px-2 border border-gray-300 rounded-md" />
                        : p.vencimento.split('-').reverse().join('/')}
                    </td>
                    <td className="px-2 py-1.5">
                      {modalidade === 'personalizadas'
                        ? <input inputMode="numeric" aria-label={`Valor da parcela ${p.numero}`} value={p.valor} onChange={(e) => alterarParcela(i, 'valor', e.target.value)} className="w-full min-w-0 h-10 px-2 border border-gray-300 rounded-md" />
                        : <span className="font-medium">R$ {p.valor}</span>}
                    </td>
                    {financiamento && (
                      <td className="px-2 py-1.5">
                        <input inputMode="numeric" aria-label={`Juros da parcela ${p.numero}`} value={p.juros} onChange={(e) => alterarParcela(i, 'juros', e.target.value)} placeholder="0,00" className="w-full min-w-0 h-10 px-2 border border-gray-300 rounded-md" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-red-700 mt-3">{erro}</p>}
    </Modal>
  );
}
