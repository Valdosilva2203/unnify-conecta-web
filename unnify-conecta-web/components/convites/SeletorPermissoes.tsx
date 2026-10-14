'use client';

import { FUNCOES, PERMISSOES, type Funcao, type Permissao } from '@/lib/contabil';

export const PERMISSOES_SUGERIDAS: Permissao[] = ['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos', 'gerenciar_obrigacoes'];

// Escolha de função e permissões do vínculo (mesmas opções da gestão de vínculos)
export function SeletorPermissoes({ prefixo, funcao, aoMudarFuncao, permissoes, aoMudarPermissoes, somenteLeitura = false }: {
  prefixo: string; funcao?: Funcao; aoMudarFuncao?: (f: Funcao) => void; permissoes: Permissao[]; aoMudarPermissoes?: (p: Permissao[]) => void; somenteLeitura?: boolean;
}) {
  return (
    <div className="space-y-4">
      {funcao && aoMudarFuncao && (
        <div>
          <label htmlFor={`${prefixo}-funcao`} className="block text-sm font-semibold text-gray-900 mb-2">Função do contador</label>
          <select id={`${prefixo}-funcao`} value={funcao} onChange={(e) => aoMudarFuncao(e.target.value as Funcao)}
            className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            {Object.entries(FUNCOES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">A empresa pode ter vários contadores; só um como principal.</p>
        </div>
      )}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-2">{somenteLeitura ? 'Acessos autorizados pela empresa' : 'O que o contador poderá acessar'}</legend>
        {somenteLeitura ? (
          <ul className="flex flex-wrap gap-1.5">{permissoes.map((p) => <li key={p} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{PERMISSOES[p] ?? p}</li>)}</ul>
        ) : (
          <div className="grid sm:grid-cols-2 gap-x-2">
            {Object.entries(PERMISSOES).map(([chave, rotulo]) => (
              <label key={chave} className="flex items-center gap-3 min-h-11 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={permissoes.includes(chave as Permissao)}
                  onChange={(e) => aoMudarPermissoes?.(e.target.checked ? [...permissoes, chave as Permissao] : permissoes.filter((p) => p !== chave))} />
                <span className="text-sm text-gray-800">{rotulo}</span>
              </label>
            ))}
          </div>
        )}
        {!somenteLeitura && permissoes.length === 0 && <p className="text-xs text-red-600 mt-1">Selecione ao menos uma permissão.</p>}
      </fieldset>
    </div>
  );
}
