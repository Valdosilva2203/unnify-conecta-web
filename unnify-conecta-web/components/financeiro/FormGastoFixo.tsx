'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Paperclip, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, formatarData, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara,
  type Categoria, type ContaFinanceira,
} from '@/lib/financeiro';
import { RECORRENCIAS, TIPOS_VALOR, type ContextoGasto, type GastoFixo, type Recorrencia, type TipoValor } from '@/lib/gastos-fixos';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalCategoria } from './Categorias';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

// Documento no bucket privado: <id_empresa | plataforma>/gastos-fixos/<id_gasto>/<arquivo>
export async function enviarDocumentoGasto(contexto: ContextoGasto, idEmpresa: string | null, idGasto: string, arquivo: File): Promise<string | null> {
  if (!ARQUIVOS_COMPROVANTE.includes(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) return 'Documento: PDF, JPG, PNG ou WebP até 10 MB.';
  const supabase = createClient();
  const extensao = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[arquivo.type];
  const caminho = `${contexto === 'empresa' ? idEmpresa : 'plataforma'}/gastos-fixos/${idGasto}/${crypto.randomUUID()}.${extensao}`;
  const envio = await supabase.storage.from('comprovantes-financeiros').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (envio.error) return 'Não foi possível enviar o documento.';
  const { error } = await supabase.rpc('registrar_anexo_gasto_fixo', { p_id_gasto: idGasto, p_caminho: caminho, p_nome_arquivo: arquivo.name });
  if (error) {
    await supabase.storage.from('comprovantes-financeiros').remove([caminho]);
    return 'Não foi possível registrar o documento.';
  }
  return null;
}

interface Props {
  aberto: boolean;
  gasto: GastoFixo | null; // null = novo
  contexto: ContextoGasto;
  idEmpresa: string | null;
  categorias: Categoria[];
  contas: ContaFinanceira[];
  subcategorias: string[];
  aoFechar: () => void;
  aoSalvar: (mensagem: string, id: string) => void;
  aoAlterarCategorias: (mensagem: string) => void;
}

export function FormGastoFixo({ aberto, gasto, contexto, idEmpresa, categorias, contas, subcategorias, aoFechar, aoSalvar, aoAlterarCategorias }: Props) {
  const [nome, setNome] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [valor, setValor] = useState('');
  const [tipoValor, setTipoValor] = useState<TipoValor>('fixo');
  const [recorrencia, setRecorrencia] = useState<Recorrencia>('mensal');
  const [dia, setDia] = useState('10');
  const [categoria, setCategoria] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [inicio, setInicio] = useState('');
  const [termino, setTermino] = useState('');
  const [conta, setConta] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState(false);
  const travado = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    const hoje = hojeBrasil();
    setNome(gasto?.nome ?? '');
    setContraparte(gasto?.contraparte ?? '');
    setValor(gasto ? valorParaMascara(gasto.valor) : '');
    setTipoValor(gasto?.tipo_valor ?? 'fixo');
    setRecorrencia(gasto?.recorrencia ?? 'mensal');
    setDia(String(gasto?.dia_vencimento ?? Number(hoje.slice(8, 10))));
    setCategoria(gasto?.id_categoria ?? '');
    setSubcategoria(gasto?.subcategoria ?? '');
    setInicio(gasto?.data_inicio ?? hoje);
    setTermino(gasto?.data_termino ?? '');
    setConta(gasto?.id_conta_financeira ?? '');
    setObservacoes(gasto?.observacoes ?? '');
    setArquivo(null);
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [aberto, gasto]);

  // Prévia dos próximos vencimentos pela mesma regra do banco
  useEffect(() => {
    if (!aberto || !inicio) return;
    let ativo = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc('previa_vencimentos_gasto_fixo', {
        p_recorrencia: recorrencia, p_dia: recorrencia === 'semanal' ? null : Number(dia), p_inicio: inicio, p_termino: termino || null,
      });
      if (ativo) setPrevia(((data as string[] | null) ?? []).map(String));
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [aberto, recorrencia, dia, inicio, termino]);

  const despesas = categorias.filter((c) => c.tipo === 'despesa' && (c.ativa || c.id === categoria));
  const contasAtivas = contas.filter((c) => !c.arquivada_em || c.id === conta);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado.current) return;
    if (nome.trim().length < 2) return setErro('Informe o nome do gasto fixo (mínimo 2 caracteres).');
    if (!paraDecimal(valor)) return setErro('Informe o valor previsto.');
    if (!categoria) return setErro('Escolha a categoria.');
    if (!inicio) return setErro('Informe a data de início.');
    if (termino && termino < inicio) return setErro('A data de término deve ser igual ou posterior ao início.');
    if (arquivo && (!ARQUIVOS_COMPROVANTE.includes(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE)) return setErro('Documento: PDF, JPG, PNG ou WebP até 10 MB.');
    travado.current = true;
    setSalvando(true);
    setErro(null);
    const { data, error } = await createClient().rpc('salvar_gasto_fixo', {
      p_id: gasto?.id ?? null, p_contexto: contexto, p_id_empresa: idEmpresa, p_nome: nome.trim(), p_contraparte: contraparte.trim() || null,
      p_id_categoria: categoria, p_subcategoria: subcategoria.trim() || null, p_tipo_valor: tipoValor, p_valor: paraDecimal(valor),
      p_recorrencia: recorrencia, p_dia_vencimento: recorrencia === 'semanal' ? null : Number(dia), p_data_inicio: inicio,
      p_data_termino: termino || null, p_id_conta_financeira: contexto === 'empresa' && conta ? conta : null, p_observacoes: observacoes.trim() || null,
    });
    let aviso = '';
    if (!error && arquivo) {
      const falha = await enviarDocumentoGasto(contexto, idEmpresa, data as string, arquivo);
      if (falha) aviso = ` Atenção: ${falha}`;
    }
    travado.current = false;
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o gasto fixo.'));
    aoSalvar((gasto ? 'Gasto fixo atualizado.' : 'Gasto fixo cadastrado.') + aviso, data as string);
  };

  return (
    <>
      <Modal
        aberto={aberto && !novaCategoria}
        aoFechar={aoFechar}
        titulo={gasto ? 'Editar gasto fixo' : 'Novo gasto fixo'}
        descricao={gasto ? 'Pagamentos já registrados não mudam; as próximas ocorrências pendentes acompanham a alteração.' : undefined}
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
            <button type="submit" form="form-gasto-fixo" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Salvando...' : 'Salvar gasto fixo'}</button>
          </>
        }
      >
        <form id="form-gasto-fixo" onSubmit={salvar} noValidate className="space-y-4">
          <div>
            <label htmlFor="gf-nome" className={rotulo}>Nome do gasto fixo <span className="text-red-600">*</span></label>
            <input id="gf-nome" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} className={campo}
              placeholder={contexto === 'plataforma' ? 'Ex.: Hospedagem dos servidores' : 'Ex.: Aluguel do escritório'} />
          </div>
          <div>
            <label htmlFor="gf-contraparte" className={rotulo}>Fornecedor (opcional)</label>
            <input id="gf-contraparte" maxLength={120} value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={campo} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gf-valor" className={rotulo}>Valor previsto (R$) <span className="text-red-600">*</span></label>
              <input id="gf-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} placeholder="0,00" className={campo} />
            </div>
            <div>
              <label htmlFor="gf-tipo-valor" className={rotulo}>Tipo de valor</label>
              <select id="gf-tipo-valor" value={tipoValor} onChange={(e) => setTipoValor(e.target.value as TipoValor)} className={campo}>
                {(Object.keys(TIPOS_VALOR) as TipoValor[]).map((t) => <option key={t} value={t}>{TIPOS_VALOR[t]}</option>)}
              </select>
            </div>
          </div>
          {tipoValor === 'variavel' && <p className="text-xs text-gray-500">Valor variável: ajuste o valor de cada ocorrência antes de pagar (em Detalhes).</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gf-recorrencia" className={rotulo}>Recorrência <span className="text-red-600">*</span></label>
              <select id="gf-recorrencia" value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as Recorrencia)} className={campo}>
                {(Object.keys(RECORRENCIAS) as Recorrencia[]).map((r) => <option key={r} value={r}>{RECORRENCIAS[r]}</option>)}
              </select>
            </div>
            {recorrencia !== 'semanal' && (
              <div>
                <label htmlFor="gf-dia" className={rotulo}>Dia de vencimento <span className="text-red-600">*</span></label>
                <select id="gf-dia" value={dia} onChange={(e) => setDia(e.target.value)} className={campo}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{String(d).padStart(2, '0')}</option>)}
                </select>
              </div>
            )}
          </div>
          {recorrencia === 'semanal' && <p className="text-xs text-gray-500">Semanal: vence a cada 7 dias a partir da data de início.</p>}
          <div>
            <label htmlFor="gf-categoria" className={rotulo}>Categoria <span className="text-red-600">*</span></label>
            <div className="flex gap-2">
              <select id="gf-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${campo} flex-1 min-w-0`}>
                <option value="">Selecione a categoria</option>
                {despesas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button type="button" onClick={() => setNovaCategoria(true)} className={`${classeBotaoSecundario} px-3 shrink-0`}>
                <Plus className="w-4 h-4" aria-hidden="true" />Nova
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="gf-subcategoria" className={rotulo}>Subcategoria (opcional)</label>
            <input id="gf-subcategoria" list="gf-subcategorias" maxLength={60} value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} className={campo} />
            <datalist id="gf-subcategorias">{subcategorias.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gf-inicio" className={rotulo}>Data de início <span className="text-red-600">*</span></label>
              <input id="gf-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="gf-termino" className={rotulo}>Data de término (opcional)</label>
              <input id="gf-termino" type="date" value={termino} min={inicio || undefined} onChange={(e) => setTermino(e.target.value)} className={campo} />
            </div>
          </div>
          {previa.length > 0 && (
            <p className="text-xs text-gray-600" data-testid="previa-vencimentos">Próximos vencimentos: {previa.map(formatarData).join(', ')}</p>
          )}
          {contexto === 'empresa' && (
            <div>
              <label htmlFor="gf-conta" className={rotulo}>Banco vinculado (opcional)</label>
              <select id="gf-conta" value={conta} onChange={(e) => setConta(e.target.value)} className={campo}>
                <option value="">Selecione o banco...</option>
                {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Sugerido como conta de origem ao registrar o pagamento.</p>
            </div>
          )}
          <div>
            <label htmlFor="gf-observacoes" className={rotulo}>Observação (opcional)</label>
            <textarea id="gf-observacoes" rows={3} maxLength={1000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Informações adicionais sobre esta despesa..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="gf-arquivo" className="inline-flex items-center gap-2 min-h-11 px-3 rounded-lg border border-gray-300 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              {arquivo ? arquivo.name : 'Anexar documento'}
            </label>
            <input id="gf-arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-gray-500 mt-1">Contrato, nota ou outro documento (PDF ou imagem, até 10 MB).</p>
          </div>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </form>
      </Modal>

      <ModalCategoria editando={aberto && novaCategoria ? 'nova' : null} tipo="despesa" idEmpresa={contexto === 'empresa' ? idEmpresa : null}
        aoFechar={() => setNovaCategoria(false)}
        aoSalvar={(m, id) => { setNovaCategoria(false); setCategoria(id); aoAlterarCategorias(m); }} />
    </>
  );
}
