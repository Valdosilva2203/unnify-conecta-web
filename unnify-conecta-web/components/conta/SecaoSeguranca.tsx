'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Smartphone, MonitorSmartphone, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatarDataHora } from '@/lib/conta';
import { Modal, classeBotaoPrimario, classeBotaoSecundario, classeBotaoPerigo } from '@/components/ui/Modal';
import { SegurancaConta } from './SegurancaConta';
import { Aviso } from './Aviso';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';
type Retorno = { tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null;

function Cartao({ id, icone: Icone, titulo, descricao, children }: { id: string; icone: typeof KeyRound; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center">
          <Icone className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id={id} className="text-lg font-bold text-gray-900">
            {titulo}
          </h2>
          <p className="text-sm text-gray-600">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const REGRAS_SENHA = [
  { teste: (s: string) => s.length >= 8, texto: 'Mínimo de 8 caracteres' },
  { teste: (s: string) => /[a-z]/.test(s), texto: 'Letra minúscula' },
  { teste: (s: string) => /[A-Z]/.test(s), texto: 'Letra maiúscula' },
  { teste: (s: string) => /[0-9]/.test(s), texto: 'Número' },
  { teste: (s: string) => /[^A-Za-z0-9]/.test(s), texto: 'Símbolo (ex.: ! @ # $ %)' },
];

function AlterarSenha() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setRetorno(null);
    if (!atual) return setRetorno({ tipo: 'erro', texto: 'Informe sua senha atual.' });
    if (!REGRAS_SENHA.every((r) => r.teste(nova))) return setRetorno({ tipo: 'erro', texto: 'A nova senha não atende aos requisitos.' });
    if (nova !== confirmacao) return setRetorno({ tipo: 'erro', texto: 'A confirmação não confere com a nova senha.' });
    if (nova === atual) return setRetorno({ tipo: 'erro', texto: 'A nova senha deve ser diferente da atual.' });
    setSalvando(true);
    // A senha atual é conferida pelo próprio Supabase Auth (exigência ativada no projeto).
    const { error } = await createClient().auth.updateUser({ password: nova, current_password: atual });
    setSalvando(false);
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (error.code === 'same_password') return setRetorno({ tipo: 'erro', texto: 'A nova senha deve ser diferente da atual.' });
      if (error.code === 'weak_password') return setRetorno({ tipo: 'erro', texto: 'Senha fraca. Escolha uma senha mais forte.' });
      if (error.status === 429) return setRetorno({ tipo: 'erro', texto: 'Muitas tentativas. Aguarde um pouco.' });
      if (msg.includes('current') || error.code === 'invalid_credentials') return setRetorno({ tipo: 'erro', texto: 'Senha atual incorreta.' });
      if (error.code === 'insufficient_aal') return setRetorno({ tipo: 'erro', texto: 'Confirme o código de duas etapas e tente de novo.' });
      return setRetorno({ tipo: 'erro', texto: 'Não foi possível alterar a senha. Tente novamente.' });
    }
    setAtual('');
    setNova('');
    setConfirmacao('');
    setRetorno({ tipo: 'sucesso', texto: 'Senha alterada. Use a nova senha no próximo acesso.' });
  };

  const tipo = mostrar ? 'text' : 'password';
  return (
    <Cartao id="titulo-senha" icone={KeyRound} titulo="Alterar senha" descricao="Por segurança, confirmamos sua senha atual antes da troca.">
      <form onSubmit={salvar} noValidate className="space-y-4">
        <div>
          <label htmlFor="senha-atual" className="block text-sm font-semibold text-gray-900 mb-2">
            Senha atual
          </label>
          <input id="senha-atual" type={tipo} autoComplete="current-password" className={campo} value={atual} onChange={(e) => setAtual(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="senha-nova" className="block text-sm font-semibold text-gray-900 mb-2">
              Nova senha
            </label>
            <input id="senha-nova" type={tipo} autoComplete="new-password" className={campo} value={nova} onChange={(e) => setNova(e.target.value)} />
          </div>
          <div>
            <label htmlFor="senha-confirmacao" className="block text-sm font-semibold text-gray-900 mb-2">
              Confirmar nova senha
            </label>
            <input id="senha-confirmacao" type={tipo} autoComplete="new-password" className={campo} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          </div>
        </div>
        {nova && (
          <ul className="grid gap-1 sm:grid-cols-2 text-xs" aria-label="Requisitos da senha">
            {REGRAS_SENHA.map((r) => (
              <li key={r.texto} className={r.teste(nova) ? 'text-green-700' : 'text-gray-500'}>
                {r.teste(nova) ? '✓' : '•'} {r.texto}
              </li>
            ))}
          </ul>
        )}
        <label className="flex w-fit items-center gap-2 min-h-11 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
          {mostrar ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          Mostrar senhas
        </label>
        {retorno && <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>}
        <button type="submit" disabled={salvando} className={`${classeBotaoPrimario} w-full sm:w-auto`}>
          {salvando ? 'Salvando...' : 'Alterar senha'}
        </button>
      </form>
    </Cartao>
  );
}

function DuasEtapas() {
  const [carregando, setCarregando] = useState(true);
  const [fatorAtivo, setFatorAtivo] = useState<{ id: string; criado: string } | null>(null);
  const [cadastro, setCadastro] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [desativando, setDesativando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);

  const carregar = useCallback(async () => {
    const { data } = await createClient().auth.mfa.listFactors();
    const ativo = data?.totp?.find((f) => f.status === 'verified');
    setFatorAtivo(ativo ? { id: ativo.id, criado: ativo.created_at } : null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const iniciar = async () => {
    setRetorno(null);
    setOcupado(true);
    const supabase = createClient();
    // Remove cadastros iniciados e não concluídos antes de começar outro.
    const { data: fatores } = await supabase.auth.mfa.listFactors();
    for (const f of fatores?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Autenticador ${Date.now()}` });
    setOcupado(false);
    if (error || !data) return setRetorno({ tipo: 'erro', texto: 'Não foi possível iniciar a ativação. Tente novamente.' });
    setCadastro({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
  };

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    if (!cadastro) return;
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6) return setRetorno({ tipo: 'erro', texto: 'Digite os 6 números do aplicativo.' });
    setOcupado(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: limpo });
    setOcupado(false);
    if (error) return setRetorno({ tipo: 'erro', texto: 'Código inválido. Confira o aplicativo e tente de novo.' });
    setCadastro(null);
    setCodigo('');
    await carregar();
    setRetorno({ tipo: 'sucesso', texto: 'Autenticação em duas etapas ativada. O código será pedido nos próximos acessos.' });
  };

  const cancelarCadastro = async () => {
    if (cadastro) await createClient().auth.mfa.unenroll({ factorId: cadastro.id });
    setCadastro(null);
    setCodigo('');
    setRetorno(null);
  };

  const desativar = async () => {
    if (!fatorAtivo) return;
    setOcupado(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId: fatorAtivo.id });
    setOcupado(false);
    setDesativando(false);
    if (error) return setRetorno({ tipo: 'erro', texto: 'Não foi possível desativar. Entre novamente com o código e tente de novo.' });
    await carregar();
    setRetorno({ tipo: 'info', texto: 'Autenticação em duas etapas desativada.' });
  };

  return (
    <Cartao id="titulo-mfa" icone={Smartphone} titulo="Autenticação em duas etapas" descricao="Peça um código do aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy...) ao entrar.">
      {carregando ? (
        <div role="status" aria-label="Carregando" className="h-16 rounded-xl bg-gray-50 animate-pulse" />
      ) : fatorAtivo ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-700">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-semibold mr-2">Ativada</span>
            desde {formatarDataHora(fatorAtivo.criado)}
          </p>
          <button type="button" onClick={() => setDesativando(true)} className={classeBotaoSecundario}>
            Desativar
          </button>
        </div>
      ) : cadastro ? (
        <form onSubmit={confirmar} noValidate className="space-y-4">
          <ol className="text-sm text-gray-700 list-decimal pl-5 space-y-1">
            <li>Abra o aplicativo autenticador e escaneie o QR Code.</li>
            <li>Digite o código de 6 números que aparecer.</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR Code em data URL gerado pelo Supabase */}
            <img src={cadastro.qr} alt="QR Code para o aplicativo autenticador" className="w-44 h-44 rounded-xl border border-gray-200 bg-white p-2" />
            <div className="min-w-0 text-sm">
              <p className="text-gray-600">Não consegue escanear? Digite esta chave no aplicativo:</p>
              <code className="mt-1 block break-all rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 font-mono text-gray-900" data-testid="segredo-mfa">
                {cadastro.segredo}
              </code>
            </div>
          </div>
          <div>
            <label htmlFor="codigo-ativacao" className="block text-sm font-semibold text-gray-900 mb-2">
              Código do aplicativo
            </label>
            <input
              id="codigo-ativacao"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className={`${campo} max-w-[12rem] text-center tracking-[0.3em]`}
            />
          </div>
          {retorno && <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>}
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="submit" disabled={ocupado} className={classeBotaoPrimario}>
              {ocupado ? 'Verificando...' : 'Confirmar e ativar'}
            </button>
            <button type="button" onClick={cancelarCadastro} className={classeBotaoSecundario}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={iniciar} disabled={ocupado} className={`${classeBotaoPrimario} w-full sm:w-auto`}>
          {ocupado ? 'Preparando...' : 'Ativar autenticação em duas etapas'}
        </button>
      )}
      {!cadastro && retorno && <div className="mt-4"><Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso></div>}

      <Modal
        aberto={desativando}
        aoFechar={() => setDesativando(false)}
        titulo="Desativar autenticação em duas etapas?"
        descricao="Sua conta voltará a pedir apenas e-mail e senha para entrar."
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setDesativando(false)}>
              Manter ativada
            </button>
            <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={desativar}>
              Desativar
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700">Recomendamos manter ativada para proteger seus dados e os das empresas vinculadas.</p>
      </Modal>
    </Cartao>
  );
}

function Sessoes({ ultimoAcesso }: { ultimoAcesso: string | null }) {
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);

  const encerrarOutras = async () => {
    setOcupado(true);
    setRetorno(null);
    const { error } = await createClient().auth.signOut({ scope: 'others' });
    setOcupado(false);
    setRetorno(error ? { tipo: 'erro', texto: 'Não foi possível encerrar as outras sessões.' } : { tipo: 'sucesso', texto: 'As sessões em outros dispositivos foram encerradas.' });
  };

  return (
    <Cartao id="titulo-sessoes" icone={MonitorSmartphone} titulo="Sessões e dispositivos" descricao="Encerre o acesso em computadores e celulares onde você entrou.">
      <dl className="text-sm">
        <dt className="text-gray-500">Último acesso nesta conta</dt>
        <dd className="font-semibold text-gray-900">{formatarDataHora(ultimoAcesso)}</dd>
      </dl>
      <p className="text-xs text-gray-500 mt-2">A lista detalhada de dispositivos ainda não está disponível. Você pode encerrar todos os outros acessos de uma vez.</p>
      {retorno && <div className="mt-3"><Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso></div>}
      <button type="button" onClick={encerrarOutras} disabled={ocupado} className={`${classeBotaoSecundario} mt-4 w-full sm:w-auto`}>
        {ocupado ? 'Encerrando...' : 'Encerrar sessões em outros dispositivos'}
      </button>
    </Cartao>
  );
}

export function SecaoSeguranca({ ultimoAcesso }: { ultimoAcesso: string | null }) {
  return (
    <div className="space-y-5">
      <SegurancaConta />
      <AlterarSenha />
      <DuasEtapas />
      <Sessoes ultimoAcesso={ultimoAcesso} />
    </div>
  );
}
