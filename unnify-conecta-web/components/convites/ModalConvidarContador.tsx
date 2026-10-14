'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { type Funcao, type Permissao } from '@/lib/contabil';
import { enviarConviteApi } from '@/lib/convites';
import { PERMISSOES_SUGERIDAS, SeletorPermissoes } from './SeletorPermissoes';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';

// Cenário D: empresário convida contador ainda não cadastrado, já autorizando as permissões (sem segunda aprovação depois)
export function ModalConvidarContador({ aberto, aoFechar, idEmpresa, aoConcluir }: { aberto: boolean; aoFechar: () => void; idEmpresa: string; aoConcluir?: () => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [funcao, setFuncao] = useState<Funcao>('principal');
  const [permissoes, setPermissoes] = useState<Permissao[]>(PERMISSOES_SUGERIDAS);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ texto: string; alerta: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const refErro = useRef<HTMLParagraphElement>(null);
  // O formulário rola dentro da janela: o erro fica no TOPO e é trazido à vista, para nunca parecer que o envio continua
  useEffect(() => { if (erro) refErro.current?.scrollIntoView({ block: 'nearest' }); }, [erro]);

  const fechar = () => { setNome(''); setEmail(''); setMensagem(''); setErro(null); setResultado(null); setPermissoes(PERMISSOES_SUGERIDAS); aoFechar(); };
  const enviar = async () => {
    setErro(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('Informe um e-mail profissional válido.'); return; }
    if (permissoes.length === 0) { setErro('Selecione ao menos uma permissão.'); return; }
    setOcupado(true);
    const r = await enviarConviteApi({ sentido: 'empresa_para_contador', id_empresa: idEmpresa, nome, email: email.trim(), mensagem, funcao, permissoes });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setResultado(r.enviado
      ? { alerta: false, texto: `Convite enviado para ${email.trim()}. Quando o contador criar a conta e aceitar, o vínculo é ativado com as permissões que você escolheu.` }
      : { alerta: true, texto: 'Convite registrado, mas não conseguimos enviar o e-mail. Use “Reenviar” em Meu contador → Permissões.' });
    aoConcluir?.();
  };

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Convidar meu contador" descricao="Enviaremos um convite seguro, válido por 7 dias."
      rodape={resultado ? <button type="button" className={classeBotaoPrimario} onClick={fechar}>Concluir</button> : (
        <>
          <button type="button" className={classeBotaoSecundario} onClick={fechar}>Cancelar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando...' : 'Enviar convite'}</button>
        </>
      )}>
      {resultado ? (
        <p role="status" className={`text-sm rounded-lg px-3 py-3 flex gap-2 ${resultado.alerta ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'}`}>
          <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />{resultado.texto}
        </p>
      ) : (
        <div className="space-y-4">
          {erro && <p ref={refErro} role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
          <div>
            <label htmlFor="convite-nome-contador" className="block text-sm font-semibold text-gray-900 mb-2">Nome do contador ou escritório (opcional)</label>
            <input id="convite-nome-contador" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="convite-email-contador" className="block text-sm font-semibold text-gray-900 mb-2">E-mail profissional</label>
            <input id="convite-email-contador" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="convite-mensagem-contador" className="block text-sm font-semibold text-gray-900 mb-2">Mensagem (opcional)</label>
            <textarea id="convite-mensagem-contador" rows={3} maxLength={500} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <SeletorPermissoes prefixo="convite-contador" funcao={funcao} aoMudarFuncao={setFuncao} permissoes={permissoes} aoMudarPermissoes={setPermissoes} />
        </div>
      )}
    </Modal>
  );
}
