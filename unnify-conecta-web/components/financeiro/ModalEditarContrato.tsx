'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import type { Categoria, ContaFinanceira } from '@/lib/financeiro';
import { ehFinanciamento, type ContratoResumo } from '@/lib/parcelamentos';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';

// Edita os dados cadastrais do contrato (atualizar_contrato_parcelado). Valores, prazos e tipo definem as parcelas e não mudam aqui.
export function ModalEditarContrato({ contrato: c, aberto, aoFechar, categorias, contas, aoSalvar }: {
  contrato: ContratoResumo; aberto: boolean; aoFechar: () => void; categorias: Categoria[]; contas: ContaFinanceira[]; aoSalvar: (m: string) => void;
}) {
  const [nome, setNome] = useState(c.nome);
  const [contraparte, setContraparte] = useState(c.contraparte ?? '');
  const [categoria, setCategoria] = useState(c.id_categoria);
  const [conta, setConta] = useState(c.id_conta_financeira ?? '');
  const [descricao, setDescricao] = useState(c.descricao ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Reabre sempre com os dados atuais do contrato selecionado
  useEffect(() => {
    if (!aberto) return;
    setNome(c.nome); setContraparte(c.contraparte ?? ''); setCategoria(c.id_categoria); setConta(c.id_conta_financeira ?? ''); setDescricao(c.descricao ?? ''); setErro(null);
  }, [aberto, c]);

  const cats = categorias.filter((x) => x.tipo === 'despesa' && (x.ativa || x.id === c.id_categoria));
  const contasAtivas = contas.filter((x) => !x.arquivada_em || x.id === c.id_conta_financeira);

  const salvar = async () => {
    if (nome.trim().length < 2) return setErro('Informe o nome do contrato.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('atualizar_contrato_parcelado', {
      p_id: c.id, p_nome: nome, p_contraparte: contraparte || null, p_id_categoria: categoria, p_descricao: descricao || null, p_id_conta_financeira: conta || null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar as alterações.'));
    aoSalvar('Contrato atualizado. As parcelas pendentes acompanharam a alteração.');
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Editar contrato" descricao="Altere os dados cadastrais. As parcelas pendentes acompanham; as já pagas ficam como foram registradas."
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar alterações'}</button>
      </>}>
      <div className="space-y-4">
        {erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <div>
          <label htmlFor="editar-contrato-nome" className="block text-sm font-semibold text-gray-900 mb-2">Nome do contrato</label>
          <input id="editar-contrato-nome" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="editar-contrato-credor" className="block text-sm font-semibold text-gray-900 mb-2">{ehFinanciamento(c.tipo) ? 'Instituição' : 'Fornecedor'}</label>
          <input id="editar-contrato-credor" maxLength={120} value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={campo} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="editar-contrato-categoria" className="block text-sm font-semibold text-gray-900 mb-2">Categoria</label>
            <select id="editar-contrato-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
              {cats.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="editar-contrato-conta" className="block text-sm font-semibold text-gray-900 mb-2">Conta de pagamento</label>
            <select id="editar-contrato-conta" value={conta} onChange={(e) => setConta(e.target.value)} className={campo}>
              <option value="">Escolher no pagamento</option>
              {contasAtivas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="editar-contrato-descricao" className="block text-sm font-semibold text-gray-900 mb-2">Descrição (opcional)</label>
          <textarea id="editar-contrato-descricao" rows={3} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <p className="text-xs text-gray-500">Valores, número de parcelas, vencimentos e tipo não mudam. Para alterá-los, cancele o contrato e crie um novo.</p>
      </div>
    </Modal>
  );
}
