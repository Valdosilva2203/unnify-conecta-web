'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { UFS, formatarCnpj, formatarTelefone, mensagemDeErro } from '@/lib/contabil';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

export interface DadosEmpresa {
  id: string;
  razao_social: string;
  cnpj: string;
  nome_comercial: string | null;
  telefone: string | null;
  email_comercial: string;
  cidade: string;
  estado: string;
  cnae_principal: string | null;
  status_registro: string | null;
}

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

// Edição cadastral: grava SOMENTE pela função segura atualizar_dados_empresa (dono/sócio; validação no banco).
// CNPJ, razão social, tipo, situação e responsável pelo cadastro são somente leitura.
export function FormDadosEmpresa({ aberto, dados, aoFechar, aoSalvar }: {
  aberto: boolean; dados: DadosEmpresa | null; aoFechar: () => void; aoSalvar: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cnae, setCnae] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);

  useEffect(() => {
    if (!aberto || !dados) return;
    setNome(dados.nome_comercial ?? '');
    setTelefone(formatarTelefone(dados.telefone));
    setEmail(dados.email_comercial ?? '');
    setCidade(dados.cidade ?? '');
    setUf(dados.estado ?? '');
    setCnae(dados.cnae_principal ?? '');
    setErro(null);
  }, [aberto, dados]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!dados || travado.current) return;
    const digitos = telefone.replace(/\D/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro('Informe um e-mail comercial válido.');
    if (cidade.trim().length < 2) return setErro('Informe a cidade.');
    if (!uf) return setErro('Selecione a UF.');
    if (digitos && (digitos.length < 10 || digitos.length > 11)) return setErro('Telefone deve ter DDD e 8 ou 9 dígitos.');
    travado.current = true;
    setSalvando(true);
    setErro(null);
    const { error } = await createClient().rpc('atualizar_dados_empresa', {
      p_id_empresa: dados.id, p_nome_comercial: nome.trim() || null, p_telefone: digitos || null, p_email_comercial: email.trim(),
      p_cidade: cidade.trim(), p_estado: uf, p_cnae_principal: cnae.trim() || null,
    });
    travado.current = false;
    setSalvando(false);
    if (error) {
      // Função ainda não publicada no banco (migration de segurança E0 pendente)
      if (error.code === 'PGRST202') return setErro('A edição será liberada após a atualização de segurança do sistema. Tente novamente mais tarde.');
      return setErro(mensagemDeErro(error, 'Não foi possível salvar os dados da empresa.'));
    }
    aoSalvar('Dados da empresa atualizados.');
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Editar dados da empresa"
      descricao="CNPJ e razão social vêm do cadastro oficial e não podem ser alterados aqui."
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-dados-empresa" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      {dados && (
        <form id="form-dados-empresa" onSubmit={salvar} noValidate className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm">
            <div className="min-w-0"><dt className="text-gray-500 inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" />Razão social</dt><dd className="font-semibold text-gray-900 break-words">{dados.razao_social}</dd></div>
            <div className="min-w-0"><dt className="text-gray-500 inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" />CNPJ</dt><dd className="font-semibold text-gray-900">{formatarCnpj(dados.cnpj)}</dd></div>
          </dl>
          <div>
            <label htmlFor="emp-nome" className={rotulo}>Nome comercial</label>
            <input id="emp-nome" maxLength={150} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="emp-telefone" className={rotulo}>Telefone</label>
              <input id="emp-telefone" inputMode="tel" maxLength={15} value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value.replace(/\D/g, '').slice(0, 11)))} className={campo} />
            </div>
            <div>
              <label htmlFor="emp-email" className={rotulo}>E-mail comercial <span className="text-red-600">*</span></label>
              <input id="emp-email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
            </div>
          </div>
          <div className="grid gap-4 grid-cols-[1fr_6rem]">
            <div>
              <label htmlFor="emp-cidade" className={rotulo}>Cidade <span className="text-red-600">*</span></label>
              <input id="emp-cidade" maxLength={100} value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="emp-uf" className={rotulo}>UF <span className="text-red-600">*</span></label>
              <select id="emp-uf" value={uf} onChange={(e) => setUf(e.target.value)} className={campo}>
                <option value="">—</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="emp-cnae" className={rotulo}>CNAE principal</label>
            <input id="emp-cnae" maxLength={12} placeholder="Ex.: 6201-5/01" value={cnae} onChange={(e) => setCnae(e.target.value)} className={campo} />
          </div>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </form>
      )}
    </Modal>
  );
}
