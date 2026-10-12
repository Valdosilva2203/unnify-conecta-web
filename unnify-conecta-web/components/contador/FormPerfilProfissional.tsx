'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Info, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FotoPerfil } from '@/components/contabil/FotoPerfil';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ESPECIALIDADES, MODALIDADES, UFS, formatarTelefone, mensagemDeErro, type Modalidade } from '@/lib/contabil';

type Dono = { tipo: 'contador'; id: string; nomePadrao: string } | { tipo: 'escritorio'; id: string; nomePadrao: string };

interface Perfil {
  id?: string;
  nome_profissional: string;
  crc: string;
  cidade: string;
  estado: string;
  especialidades: string[];
  servicos: string[];
  descricao: string;
  modalidades_atendimento: Modalidade[];
  foto_caminho: string | null;
  email_comercial: string;
  telefone_comercial: string;
  compartilhar_contatos: boolean;
  publicado: boolean;
}

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';

export function FormPerfilProfissional({ dono }: { dono: Dono }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [servicosTexto, setServicosTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const colunaDono = dono.tipo === 'contador' ? 'id_usuario' : 'id_escritorio';
  const prefixo = `perfil-${dono.tipo}`;

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    createClient()
      .from('perfis_profissionais')
      .select('*')
      .eq(colunaDono, dono.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return;
        const p: Perfil = {
          id: data?.id,
          nome_profissional: data?.nome_profissional ?? dono.nomePadrao,
          crc: data?.crc ?? '',
          cidade: data?.cidade ?? '',
          estado: data?.estado ?? '',
          especialidades: data?.especialidades ?? [],
          servicos: data?.servicos ?? [],
          descricao: data?.descricao ?? '',
          modalidades_atendimento: data?.modalidades_atendimento ?? ['online', 'presencial'],
          foto_caminho: data?.foto_caminho ?? null,
          email_comercial: data?.email_comercial ?? '',
          telefone_comercial: data?.telefone_comercial ?? '',
          compartilhar_contatos: data?.compartilhar_contatos ?? true,
          publicado: data?.publicado ?? false,
        };
        setPerfil(p);
        setServicosTexto(p.servicos.join('\n'));
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [colunaDono, dono.id, dono.nomePadrao]);

  if (carregando || !perfil) {
    return <div role="status" aria-label="Carregando" className="h-96 rounded-2xl bg-white border border-gray-100 animate-pulse" />;
  }

  const atualizar = <K extends keyof Perfil>(chave: K, valor: Perfil[K]) => setPerfil({ ...perfil, [chave]: valor });
  const faltamParaPublicar = [
    !perfil.crc.trim() && 'CRC',
    !perfil.cidade.trim() && 'cidade',
    !perfil.estado && 'UF',
  ].filter(Boolean) as string[];

  const salvar = async (publicar = perfil.publicado) => {
    setErro(null);
    setAviso(null);
    if (perfil.nome_profissional.trim().length < 2) {
      setErro('Informe o nome profissional.');
      return;
    }
    if (publicar && faltamParaPublicar.length) {
      setErro(`Para exibir no catálogo, preencha: ${faltamParaPublicar.join(', ')}.`);
      return;
    }
    if (!perfil.modalidades_atendimento.length) {
      setErro('Marque pelo menos uma modalidade de atendimento.');
      return;
    }
    const telefone = perfil.telefone_comercial.replace(/\D/g, '');
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
      setErro('Telefone comercial inválido.');
      return;
    }
    const servicos = servicosTexto
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 15);
    const dados = {
      nome_profissional: perfil.nome_profissional.trim(),
      crc: perfil.crc.trim() || null,
      cidade: perfil.cidade.trim() || null,
      estado: perfil.estado || null,
      especialidades: perfil.especialidades,
      servicos,
      descricao: perfil.descricao.trim() || null,
      modalidades_atendimento: perfil.modalidades_atendimento,
      email_comercial: perfil.email_comercial.trim().toLowerCase() || null,
      telefone_comercial: telefone || null,
      compartilhar_contatos: perfil.compartilhar_contatos,
      publicado: publicar,
    };
    setSalvando(true);
    const supabase = createClient();
    const resultado = perfil.id
      ? await supabase.from('perfis_profissionais').update(dados).eq('id', perfil.id).select('id').single()
      : await supabase.from('perfis_profissionais').insert({ ...dados, [colunaDono]: dono.id }).select('id').single();
    setSalvando(false);
    if (resultado.error) {
      setErro(mensagemDeErro(resultado.error, 'Não foi possível salvar. Verifique os campos e tente novamente.'));
      return;
    }
    setPerfil({ ...perfil, id: resultado.data.id, publicado: publicar, servicos });
    setAviso(publicar ? 'Perfil salvo e exibido no catálogo.' : 'Perfil salvo. Ele não aparece no catálogo.');
  };

  const enviarFoto = async (arquivo: File | undefined) => {
    if (!arquivo || !perfil.id) return;
    setErro(null);
    if (!TIPOS_FOTO.includes(arquivo.type)) {
      setErro('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (arquivo.size > 2 * 1024 * 1024) {
      setErro('A foto deve ter no máximo 2 MB.');
      return;
    }
    setEnviandoFoto(true);
    const supabase = createClient();
    const caminho = `${perfil.id}/foto-${Date.now()}`;
    const envio = await supabase.storage.from('fotos-perfis').upload(caminho, arquivo, { contentType: arquivo.type });
    if (envio.error) {
      setEnviandoFoto(false);
      setErro('Não foi possível enviar a foto.');
      return;
    }
    const anterior = perfil.foto_caminho;
    const { error } = await supabase.from('perfis_profissionais').update({ foto_caminho: caminho }).eq('id', perfil.id);
    if (!error && anterior) await supabase.storage.from('fotos-perfis').remove([anterior]);
    setEnviandoFoto(false);
    if (error) {
      setErro('Não foi possível salvar a foto.');
      return;
    }
    setPerfil({ ...perfil, foto_caminho: caminho });
    setAviso('Foto atualizada.');
  };

  const removerFoto = async () => {
    if (!perfil.id || !perfil.foto_caminho) return;
    const supabase = createClient();
    const { error } = await supabase.from('perfis_profissionais').update({ foto_caminho: null }).eq('id', perfil.id);
    if (error) {
      setErro('Não foi possível remover a foto.');
      return;
    }
    await supabase.storage.from('fotos-perfis').remove([perfil.foto_caminho]);
    setPerfil({ ...perfil, foto_caminho: null });
    setAviso('Foto removida.');
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
      className="space-y-5"
    >
      <section
        className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
          perfil.publicado ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex-1">
          <p className="font-semibold text-gray-900 flex items-center gap-2">
            {perfil.publicado ? <Eye className="w-5 h-5 text-green-600" aria-hidden="true" /> : <EyeOff className="w-5 h-5 text-gray-500" aria-hidden="true" />}
            {perfil.publicado ? 'Perfil exibido no catálogo' : 'Perfil oculto do catálogo'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {perfil.publicado
              ? 'Empresas cadastradas podem encontrar este perfil e solicitar vínculo.'
              : 'Só você vê este perfil. Ative a exibição quando quiser receber solicitações de empresas.'}
          </p>
        </div>
        <label className="inline-flex items-center gap-3 min-h-11 cursor-pointer select-none">
          <input
            type="checkbox"
            role="switch"
            aria-checked={perfil.publicado}
            checked={perfil.publicado}
            disabled={salvando}
            onChange={(e) => salvar(e.target.checked)}
            className="peer sr-only"
          />
          <span className="w-12 h-7 rounded-full bg-gray-300 peer-checked:bg-green-600 relative transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500 peer-focus-visible:ring-offset-2" />
          <span className="text-sm font-semibold text-gray-900">Exibir {dono.tipo === 'contador' ? 'meu perfil' : 'o perfil do escritório'} no catálogo</span>
        </label>
      </section>

      {aviso && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </p>
      )}

      <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-5">
        <h2 className="font-bold text-gray-900">Dados públicos do catálogo</h2>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <FotoPerfil caminho={perfil.foto_caminho} nome={perfil.nome_profissional} escritorio={dono.tipo === 'escritorio'} className="w-24 h-24 text-2xl" arredondado="rounded-2xl" />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!perfil.id || enviandoFoto}
                onClick={() => arquivoRef.current?.click()}
                className={classeBotaoSecundario}
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                {enviandoFoto ? 'Enviando...' : perfil.foto_caminho ? 'Trocar foto' : 'Enviar foto'}
              </button>
              {perfil.foto_caminho && (
                <button type="button" onClick={removerFoto} className={classeBotaoSecundario}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Remover
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {perfil.id ? 'JPG, PNG ou WebP, até 2 MB.' : 'Salve o perfil uma vez para poder enviar a foto.'}
            </p>
            <input
              ref={arquivoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Selecionar foto"
              onChange={(e) => {
                enviarFoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${prefixo}-nome`} className="block text-sm font-semibold text-gray-900 mb-2">
              Nome profissional *
            </label>
            <input id={`${prefixo}-nome`} className={campo} maxLength={120} autoComplete="name" value={perfil.nome_profissional} onChange={(e) => atualizar('nome_profissional', e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${prefixo}-crc`} className="block text-sm font-semibold text-gray-900 mb-2">
              CRC {perfil.publicado && '*'}
            </label>
            <input id={`${prefixo}-crc`} className={campo} maxLength={30} placeholder="Ex.: TO-012345/O" autoComplete="off" value={perfil.crc} onChange={(e) => atualizar('crc', e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label htmlFor={`${prefixo}-cidade`} className="block text-sm font-semibold text-gray-900 mb-2">
                Cidade {perfil.publicado && '*'}
              </label>
              <input id={`${prefixo}-cidade`} className={campo} maxLength={100} autoComplete="address-level2" value={perfil.cidade} onChange={(e) => atualizar('cidade', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${prefixo}-uf`} className="block text-sm font-semibold text-gray-900 mb-2">
                UF {perfil.publicado && '*'}
              </label>
              <select id={`${prefixo}-uf`} className={campo} autoComplete="address-level1" value={perfil.estado} onChange={(e) => atualizar('estado', e.target.value)}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 mb-2">Modalidades de atendimento <span className="font-normal text-gray-500">(marque quantas quiser)</span></legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {(Object.entries(MODALIDADES) as [Modalidade, string][]).map(([valor, rotulo]) => {
              const marcado = perfil.modalidades_atendimento.includes(valor);
              return (
                <label key={valor} className="flex items-center gap-2 min-h-11 px-3 rounded-lg border border-gray-200 cursor-pointer has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-orange-600"
                    checked={marcado}
                    onChange={(ev) =>
                      atualizar(
                        'modalidades_atendimento',
                        ev.target.checked ? [...perfil.modalidades_atendimento, valor] : perfil.modalidades_atendimento.filter((m) => m !== valor)
                      )
                    }
                  />
                  <span className="text-sm text-gray-800">{rotulo}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 mb-2">Especialidades</legend>
          <div className="flex flex-wrap gap-2">
            {ESPECIALIDADES.map((e) => {
              const marcado = perfil.especialidades.includes(e);
              return (
                <label key={e} className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-full border text-sm cursor-pointer ${marcado ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-700'}`}>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-orange-600"
                    checked={marcado}
                    onChange={(ev) =>
                      atualizar('especialidades', ev.target.checked ? [...perfil.especialidades, e] : perfil.especialidades.filter((x) => x !== e))
                    }
                  />
                  {e}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${prefixo}-servicos`} className="block text-sm font-semibold text-gray-900 mb-2">
            Serviços oferecidos <span className="font-normal text-gray-500">(um por linha, até 15)</span>
          </label>
          <textarea id={`${prefixo}-servicos`} rows={5} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" value={servicosTexto} onChange={(e) => setServicosTexto(e.target.value)} placeholder={'Contabilidade mensal\nEmissão de declarações\nFolha de pagamento'} />
        </div>

        <div>
          <label htmlFor={`${prefixo}-sobre`} className="block text-sm font-semibold text-gray-900 mb-2">
            Sobre <span className="font-normal text-gray-500">({perfil.descricao.length}/1500)</span>
          </label>
          <textarea id={`${prefixo}-sobre`} rows={5} maxLength={1500} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" value={perfil.descricao} onChange={(e) => atualizar('descricao', e.target.value)} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-gray-900">Contatos comerciais</h2>
          <p className="text-sm text-gray-600 mt-1 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
            Nunca aparecem no catálogo. São mostrados apenas às empresas com vínculo aprovado, se você permitir.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${prefixo}-email`} className="block text-sm font-semibold text-gray-900 mb-2">
              E-mail comercial
            </label>
            <input id={`${prefixo}-email`} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" className={campo} value={perfil.email_comercial} onChange={(e) => atualizar('email_comercial', e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${prefixo}-telefone`} className="block text-sm font-semibold text-gray-900 mb-2">
              Telefone comercial
            </label>
            <input id={`${prefixo}-telefone`} type="tel" inputMode="tel" autoComplete="tel" className={campo} value={formatarTelefone(perfil.telefone_comercial)} onChange={(e) => atualizar('telefone_comercial', e.target.value.replace(/\D/g, '').slice(0, 11))} />
          </div>
        </div>
        <label className="flex items-center gap-3 min-h-11 cursor-pointer">
          <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={perfil.compartilhar_contatos} onChange={(e) => atualizar('compartilhar_contatos', e.target.checked)} />
          <span className="text-sm text-gray-800">Compartilhar estes contatos com empresas após a aprovação do vínculo</span>
        </label>
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={salvando} className={`${classeBotaoPrimario} w-full sm:w-auto`}>
          {salvando ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>
    </form>
  );
}
