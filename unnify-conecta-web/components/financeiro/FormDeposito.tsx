'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, hojeBrasil, mascaraMoeda, paraDecimal, type ContaFinanceira } from '@/lib/financeiro';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorConta } from './SeletorConta';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
type Origem = 'especie' | 'conta' | 'externa';
type Classificacao = 'aporte_socio' | 'financiamento';

// Comprovante do depósito: bucket privado, pasta do próprio depósito; se o registro falhar, o envio é descartado
async function enviarComprovanteDeposito(idEmpresa: string, idDeposito: string, arquivo: File): Promise<string | null> {
  const extensao = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[arquivo.type];
  const caminho = `${idEmpresa}/depositos/${idDeposito}/${crypto.randomUUID()}.${extensao}`;
  const supabase = createClient();
  const { error: erroEnvio } = await supabase.storage.from('comprovantes-financeiros').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (erroEnvio) return 'não foi possível enviar o arquivo.';
  const { error } = await supabase.rpc('registrar_comprovante_deposito', { p_id_deposito: idDeposito, p_caminho: caminho, p_nome_arquivo: arquivo.name });
  if (error) { await supabase.storage.from('comprovantes-financeiros').remove([caminho]); return mensagemDeErro(error, 'não foi possível registrar o arquivo.'); }
  return null;
}

// Depositar: entrada numa conta bancária. Espécie e conta → conta são transferências (não mudam o total da empresa);
// origem externa exige classificação (aporte de sócio ou empréstimo) e nunca vira receita de vendas. O banco valida tudo de novo.
export function FormDeposito({ aberto, idEmpresa, contas, aoFechar, aoSalvar }: {
  aberto: boolean; idEmpresa: string; contas: ContaFinanceira[]; aoFechar: () => void; aoSalvar: (m: string) => void;
}) {
  const ativas = contas.filter((c) => !c.arquivada_em);
  const bancos = ativas.filter((c) => c.tipo !== 'caixa');
  const caixas = ativas.filter((c) => c.tipo === 'caixa');
  const [destino, setDestino] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [origem, setOrigem] = useState<Origem | ''>('');
  const [contaOrigem, setContaOrigem] = useState('');
  const [classificacao, setClassificacao] = useState<Classificacao | ''>('');
  const [contraparte, setContraparte] = useState('');
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);
  const chave = useRef('');

  useEffect(() => {
    if (!aberto) return;
    chave.current = crypto.randomUUID(); // identificador idempotente: repetir o envio não duplica o depósito
    setDestino((bancos.find((c) => c.principal) ?? bancos[0])?.id ?? '');
    setValor(''); setData(hojeBrasil()); setOrigem(''); setContaOrigem(''); setClassificacao(''); setContraparte(''); setDescricao(''); setArquivo(null); setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [aberto]);

  const escolherOrigem = (o: Origem) => {
    setOrigem(o); setErro(null);
    setContaOrigem(o === 'especie' ? (caixas[0]?.id ?? '') : '');
  };
  const origensConta = bancos.filter((c) => c.id !== destino);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado.current) return;
    if (!destino) return setErro('Escolha a conta de destino.');
    const decimal = paraDecimal(valor);
    if (!decimal) return setErro('Informe um valor maior que zero.');
    if (!data) return setErro('Informe a data do depósito.');
    if (data > hojeBrasil()) return setErro('A data do depósito não pode ser futura.');
    if (!origem) return setErro('Escolha a origem do dinheiro.');
    if (origem === 'especie' && !contaOrigem) return setErro('Cadastre uma conta do tipo Caixa físico para registrar depósitos em espécie.');
    if (origem === 'conta' && !contaOrigem) return setErro('Escolha a conta de origem.');
    if (origem !== 'externa' && contaOrigem === destino) return setErro('A origem não pode ser a própria conta de destino.');
    if (origem === 'externa' && !classificacao) return setErro('Classifique a origem externa.');
    if (origem === 'externa' && contraparte.trim().length < 2) return setErro(classificacao === 'aporte_socio' ? 'Informe o sócio que fez o aporte.' : 'Informe a instituição ou credor.');
    if (arquivo && !ARQUIVOS_COMPROVANTE.includes(arquivo.type)) return setErro('Comprovante: use PDF, JPG, PNG ou WebP.');
    if (arquivo && arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) return setErro('Comprovante: no máximo 10 MB.');
    travado.current = true; setSalvando(true); setErro(null);
    const { data: id, error } = await createClient().rpc('registrar_deposito', {
      p_id: chave.current, p_id_empresa: idEmpresa, p_id_conta_destino: destino, p_origem: origem, p_id_conta_origem: origem === 'externa' ? null : contaOrigem,
      p_classificacao: origem === 'externa' ? classificacao : null, p_contraparte: origem === 'externa' ? contraparte.trim() : null,
      p_valor: decimal, p_data: data, p_descricao: descricao.trim() || null,
    });
    if (error) { travado.current = false; setSalvando(false); return setErro(mensagemDeErro(error, 'Não foi possível registrar o depósito.')); }
    let aviso = 'Depósito registrado.';
    if (arquivo) {
      const falha = await enviarComprovanteDeposito(idEmpresa, id as string, arquivo);
      if (falha) aviso += ` Comprovante não anexado: ${falha}`;
    }
    travado.current = false; setSalvando(false);
    aoSalvar(aviso);
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Depositar" descricao="Registra dinheiro que entrou numa conta bancária. Não é receita de vendas."
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="submit" form="form-deposito" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Registrando...' : 'Confirmar depósito'}</button>
      </>}>
      <form id="form-deposito" onSubmit={salvar} noValidate className="space-y-4">
        <SeletorConta id="dep-destino" rotulo="Conta de destino" contas={bancos} idConta={destino} aoMudar={(id) => { setDestino(id); if (id === contaOrigem && origem === 'conta') setContaOrigem(''); }} valor={paraDecimal(valor)} natureza="entrada" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="dep-valor" className={rotulo}>Valor (R$)</label>
            <input id="dep-valor" inputMode="numeric" className={campo} value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} placeholder="0,00" /></div>
          <div><label htmlFor="dep-data" className={rotulo}>Data do depósito</label>
            <input id="dep-data" type="date" max={hojeBrasil()} className={campo} value={data} onChange={(e) => setData(e.target.value)} /></div>
        </div>
        <fieldset>
          <legend className={rotulo}>Origem do dinheiro</legend>
          <div className="grid gap-2">
            {([['especie', 'Dinheiro em espécie / caixa'], ['conta', 'Outra conta bancária cadastrada'], ['externa', 'Outra origem externa']] as [Origem, string][]).map(([id, r]) => (
              <label key={id} className={`flex items-center gap-2 min-h-11 px-3 rounded-lg border text-sm cursor-pointer ${origem === id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                <input type="radio" name="dep-origem" value={id} checked={origem === id} onChange={() => escolherOrigem(id)} className="w-4 h-4 accent-orange-600" />{r}
              </label>
            ))}
          </div>
        </fieldset>
        {origem === 'especie' && (caixas.length === 0 ? (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Não há caixa cadastrado. Cadastre uma conta do tipo <strong>Caixa físico</strong> em Nova conta para registrar depósitos em espécie (o valor sai do caixa e entra no banco).
          </p>
        ) : (
          <SeletorConta id="dep-caixa" rotulo="Caixa de origem" contas={caixas} idConta={contaOrigem} aoMudar={setContaOrigem} valor={paraDecimal(valor)} natureza="saida" />
        ))}
        {origem === 'conta' && (origensConta.length === 0 ? (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Não há outra conta bancária ativa para ser a origem.</p>
        ) : (
          <SeletorConta id="dep-origem-conta" rotulo="Conta de origem" contas={origensConta} idConta={contaOrigem} aoMudar={setContaOrigem} valor={paraDecimal(valor)} natureza="saida" />
        ))}
        {origem === 'externa' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="dep-classificacao" className={rotulo}>Classificação</label>
              <select id="dep-classificacao" className={campo} value={classificacao} onChange={(e) => setClassificacao(e.target.value as Classificacao)}>
                <option value="">Selecione</option>
                <option value="aporte_socio">Aporte de sócio</option>
                <option value="financiamento">Empréstimo / financiamento</option>
              </select></div>
            <div><label htmlFor="dep-contraparte" className={rotulo}>{classificacao === 'financiamento' ? 'Instituição ou credor' : 'Sócio'}</label>
              <input id="dep-contraparte" maxLength={120} className={campo} value={contraparte} onChange={(e) => setContraparte(e.target.value)} /></div>
            <p className="sm:col-span-2 text-xs text-gray-500">Entra como receita não operacional (não conta como venda). Venda recebida deve ser lançada como receita em Lançamentos.</p>
          </div>
        )}
        <div><label htmlFor="dep-descricao" className={rotulo}>Descrição <span className="font-normal text-gray-500">(opcional)</span></label>
          <input id="dep-descricao" maxLength={200} className={campo} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div><label htmlFor="dep-comprovante" className={rotulo}>Comprovante <span className="font-normal text-gray-500">(opcional)</span></label>
          <input id="dep-comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG ou WebP até 10 MB. Fica privado.</p></div>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}
