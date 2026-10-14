'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MapPin, Monitor, Briefcase, Layers, Send } from 'lucide-react';
import { ModalConvidarContador } from '@/components/convites/ModalConvidarContador';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { FotoPerfil } from '@/components/contabil/FotoPerfil';
import { BarraFiltros, BotaoLimparFiltros, CampoBusca, FiltroSelect, IconeCidade } from '@/components/admin/tabela';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ESPECIALIDADES, MODALIDADES, UFS, descreverModalidades, mensagemDeErro } from '@/lib/contabil';

interface PerfilCatalogo {
  id: string;
  tipo: 'contador' | 'escritorio';
  nome_profissional: string;
  crc: string | null;
  cidade: string | null;
  estado: string | null;
  especialidades: string[];
  servicos: string[];
  descricao: string | null;
  modalidades_atendimento: string[];
  foto_caminho: string | null;
  total: number;
}

const POR_PAGINA = 12;

export default function BuscarContadorPage() {
  const { empresa } = useEmpresaAtual();
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [modalidade, setModalidade] = useState('');
  const [tipo, setTipo] = useState('');
  const [resultados, setResultados] = useState<PerfilCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);
  const [convidando, setConvidando] = useState(false);

  const buscar = useCallback(
    async (deslocamento: number) => {
      const atual = ++requisicao.current;
      const { data, error } = await createClient().rpc('buscar_catalogo_contadores', {
        p_busca: busca.trim() || null,
        p_estado: estado || null,
        p_especialidade: especialidade || null,
        p_modalidade: modalidade || null,
        p_tipo: tipo || null,
        p_limite: POR_PAGINA,
        p_deslocamento: deslocamento,
      });
      if (atual !== requisicao.current) return; // descarta respostas antigas (digitação rápida)
      if (error) {
        setErro(mensagemDeErro(error, 'Não foi possível carregar o catálogo.'));
      } else {
        setErro(null);
        const linhas = (data ?? []) as PerfilCatalogo[];
        setResultados((anterior) => (deslocamento === 0 ? linhas : [...anterior, ...linhas]));
        setTotal(linhas[0]?.total ?? (deslocamento === 0 ? 0 : total));
      }
      setCarregando(false);
      setCarregandoMais(false);
    },
    [busca, estado, especialidade, modalidade, tipo, total]
  );

  useEffect(() => {
    if (!empresa) return;
    setCarregando(true);
    const t = setTimeout(() => buscar(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refaz a busca só quando os filtros mudam
  }, [empresa, busca, estado, especialidade, modalidade, tipo]);

  const temFiltros = busca || estado || especialidade || modalidade || tipo;
  if (!empresa) return null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/app/meu-contador" className="inline-flex items-center gap-1 min-h-11 -ml-1 text-sm text-gray-600 hover:text-orange-600">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Meu contador
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Encontre seu contador</h1>
        <p className="text-gray-600 mt-1">Explore os profissionais e escritórios cadastrados no Unnify Conecta.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4">
        <BarraFiltros>
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, cidade, especialidade..." />
          <FiltroSelect icone={IconeCidade} valor={estado} aoMudar={setEstado}>
            <option value="">UF: Todas</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect icone={Layers} valor={especialidade} aoMudar={setEspecialidade}>
            <option value="">Especialidade</option>
            {ESPECIALIDADES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect icone={Monitor} valor={modalidade} aoMudar={setModalidade}>
            <option value="">Atendimento</option>
            {Object.entries(MODALIDADES).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect icone={Briefcase} valor={tipo} aoMudar={setTipo}>
            <option value="">Contadores e escritórios</option>
            <option value="contador">Só contadores</option>
            <option value="escritorio">Só escritórios</option>
          </FiltroSelect>
          {temFiltros && (
            <BotaoLimparFiltros
              aoClicar={() => {
                setBusca('');
                setEstado('');
                setEspecialidade('');
                setModalidade('');
                setTipo('');
              }}
            />
          )}
        </BarraFiltros>
      </div>

      <p className="text-sm text-gray-600" aria-live="polite">
        {carregando ? 'Buscando...' : `${total} ${total === 1 ? 'resultado encontrado' : 'resultados encontrados'}`}
      </p>

      {erro && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          {erro}
        </div>
      )}

      {carregando && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Carregando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 rounded-2xl bg-white border border-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!carregando && !erro && resultados.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-12 text-center">
          <p className="font-semibold text-gray-900">
            {temFiltros ? 'Nenhum profissional encontrado com esses filtros.' : 'Ainda não há profissionais publicados no catálogo.'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {temFiltros ? 'Tente remover algum filtro.' : 'Os contadores aparecem aqui quando escolhem exibir o perfil no catálogo.'}
          </p>
        </div>
      )}

      {!carregando && resultados.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resultados.map((p) => (
            <li key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 flex gap-3 items-center">
                <FotoPerfil caminho={p.foto_caminho} nome={p.nome_profissional} escritorio={p.tipo === 'escritorio'} className="w-16 h-16 text-xl" arredondado="rounded-2xl" />
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-900 break-words">{p.nome_profissional}</h2>
                  <p className="text-xs text-gray-600">
                    {p.tipo === 'escritorio' ? 'Escritório contábil' : 'Contador(a)'}
                    {p.crc ? ` · CRC ${p.crc}` : ''}
                  </p>
                </div>
              </div>
              <div className="px-4 space-y-1.5 text-sm text-gray-700 flex-1">
                {p.especialidades.length > 0 && <p className="line-clamp-1">{p.especialidades.slice(0, 3).join(', ')}</p>}
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 shrink-0 text-gray-500" aria-hidden="true" />
                  {[p.cidade, p.estado].filter(Boolean).join('/')}
                </p>
                <p className="flex items-start gap-1.5">
                  <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
                  <span>{descreverModalidades(p.modalidades_atendimento)}</span>
                </p>
                {p.servicos.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Serviços">
                    {p.servicos.slice(0, 3).map((s) => (
                      <li key={s} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-4">
                <Link href={`/app/meu-contador/${p.id}`} className={`${classeBotaoPrimario} w-full`} aria-label={`Ver perfil de ${p.nome_profissional}`}>
                  Ver perfil
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!carregando && (
        <section aria-label="Convidar meu contador" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="w-12 h-12 shrink-0 rounded-full bg-orange-50 text-orange-600 inline-flex items-center justify-center"><Send className="w-5 h-5" aria-hidden="true" /></span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900">Não encontrou seu contador?</h2>
            <p className="text-sm text-gray-600">Convide seu contador ou escritório contábil para fazer parte do Unnify Conecta.</p>
          </div>
          <button type="button" className={classeBotaoPrimario} onClick={() => setConvidando(true)}>Convidar meu contador</button>
        </section>
      )}
      <ModalConvidarContador aberto={convidando} aoFechar={() => setConvidando(false)} idEmpresa={empresa.id} />

      {!carregando && resultados.length < total && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={carregandoMais}
            className={classeBotaoSecundario}
            onClick={() => {
              setCarregandoMais(true);
              buscar(resultados.length);
            }}
          >
            {carregandoMais ? 'Carregando...' : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  );
}
