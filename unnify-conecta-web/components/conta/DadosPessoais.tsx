'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatarTelefone, mensagemDeErro } from '@/lib/contabil';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { AvatarUsuario } from './AvatarUsuario';
import { Aviso } from './Aviso';
import type { PerfilPessoal } from '@/lib/conta';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';

interface Props {
  idUsuario: string;
  perfil: PerfilPessoal;
  aoAtualizar: (parcial: Partial<PerfilPessoal>) => void;
  focarNome: number;
}

export function DadosPessoais({ idUsuario, perfil, aoAtualizar, focarNome }: Props) {
  const [nome, setNome] = useState(perfil.nome_completo ?? '');
  const [telefone, setTelefone] = useState(perfil.telefone ?? '');
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [retorno, setRetorno] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focarNome) nomeRef.current?.focus();
  }, [focarNome]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setRetorno(null);
    const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
    const digitos = telefone.replace(/\D/g, '');
    if (nomeLimpo.length < 3) {
      setRetorno({ tipo: 'erro', texto: 'Informe o nome completo (mínimo 3 caracteres).' });
      return;
    }
    if (digitos && (digitos.length < 10 || digitos.length > 11)) {
      setRetorno({ tipo: 'erro', texto: 'Telefone inválido. Use DDD + número.' });
      return;
    }
    setSalvando(true);
    const { error } = await createClient().rpc('atualizar_dados_pessoais', { p_nome_completo: nomeLimpo, p_telefone: digitos || null });
    setSalvando(false);
    if (error) {
      setRetorno({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível salvar. Tente novamente.') });
      return;
    }
    setNome(nomeLimpo);
    aoAtualizar({ nome_completo: nomeLimpo, telefone: digitos || null });
    setRetorno({ tipo: 'sucesso', texto: 'Dados pessoais atualizados.' });
  };

  const enviarFoto = async (arquivo: File) => {
    setRetorno(null);
    if (!TIPOS.includes(arquivo.type)) {
      setRetorno({ tipo: 'erro', texto: 'Use uma imagem JPG, PNG ou WebP.' });
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      setRetorno({ tipo: 'erro', texto: 'A foto deve ter no máximo 2 MB.' });
      return;
    }
    setEnviandoFoto(true);
    const supabase = createClient();
    const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
    const caminho = `${idUsuario}/avatar-${Date.now()}.${extensao}`;
    const { error: erroEnvio } = await supabase.storage.from('avatares').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (erroEnvio) {
      setEnviandoFoto(false);
      setRetorno({ tipo: 'erro', texto: 'Não foi possível enviar a foto.' });
      return;
    }
    const { error } = await supabase.rpc('definir_avatar', { p_caminho: caminho });
    if (error) {
      await supabase.storage.from('avatares').remove([caminho]);
      setEnviandoFoto(false);
      setRetorno({ tipo: 'erro', texto: 'Não foi possível salvar a foto.' });
      return;
    }
    if (perfil.url_avatar) await supabase.storage.from('avatares').remove([perfil.url_avatar]);
    setEnviandoFoto(false);
    aoAtualizar({ url_avatar: caminho });
    setRetorno({ tipo: 'sucesso', texto: 'Foto atualizada.' });
  };

  const removerFoto = async () => {
    if (!perfil.url_avatar) return;
    setRetorno(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('definir_avatar', { p_caminho: null });
    if (error) {
      setRetorno({ tipo: 'erro', texto: 'Não foi possível remover a foto.' });
      return;
    }
    await supabase.storage.from('avatares').remove([perfil.url_avatar]);
    aoAtualizar({ url_avatar: null });
    setRetorno({ tipo: 'sucesso', texto: 'Foto removida.' });
  };

  return (
    <section aria-labelledby="titulo-dados" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
      <h2 id="titulo-dados" className="text-lg font-bold text-gray-900">
        Dados pessoais
      </h2>
      <p className="text-sm text-gray-600">Atualize suas informações pessoais.</p>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <AvatarUsuario caminho={perfil.url_avatar} nome={nome || 'Usuário'} className="w-20 h-20 text-2xl" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Foto de perfil</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => arquivoRef.current?.click()} disabled={enviandoFoto} className={classeBotaoSecundario}>
              <Camera className="w-4 h-4" aria-hidden="true" />
              {enviandoFoto ? 'Enviando...' : perfil.url_avatar ? 'Alterar foto' : 'Adicionar foto'}
            </button>
            {perfil.url_avatar && (
              <button type="button" onClick={removerFoto} className={classeBotaoSecundario}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Remover
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">JPG, PNG ou WebP. Máx. 2 MB.</p>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Selecionar foto de perfil"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = '';
              if (arquivo) enviarFoto(arquivo);
            }}
          />
        </div>
      </div>

      <form onSubmit={salvar} noValidate className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="conta-nome" className="block text-sm font-semibold text-gray-900 mb-2">
              Nome completo
            </label>
            <input ref={nomeRef} id="conta-nome" className={campo} maxLength={120} autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label htmlFor="conta-telefone" className="block text-sm font-semibold text-gray-900 mb-2">
              Telefone
            </label>
            <input
              id="conta-telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(63) 99999-9999"
              className={campo}
              value={formatarTelefone(telefone)}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">Essas informações são usadas apenas para identificar você na plataforma.</p>
        {retorno && <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>}
        <button type="submit" disabled={salvando} className={`${classeBotaoPrimario} w-full sm:w-auto`}>
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>
    </section>
  );
}
