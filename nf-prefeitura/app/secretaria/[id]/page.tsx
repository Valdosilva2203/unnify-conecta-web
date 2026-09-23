"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Home, Users, FileText, Building2, LogOut, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import TopNavBar from "@/components/TopNavBar";

interface Secretaria {
  id: string;
  prefeitura_id: string;
  nome: string;
  email: string;
  telefone: string;
  descricao: string;
}

interface DashboardData {
  totalFuncionarios: number;
  totalNotasFiscais: number;
  totalFornecedores: number;
  totalRequisicoes: number;
  orcamentoAnual: number;
  gastoAcumulado: number;
}

export default function SecretariaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const modalRef = useRef<HTMLDivElement>(null);

  const [secretaria, setSecretaria] = useState<Secretaria | null>(null);
  const [prefeitura, setPrefeitura] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [userName, setUserName] = useState("Usuário");
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalFuncionarios: 0,
    totalNotasFiscais: 0,
    totalFornecedores: 0,
    totalRequisicoes: 0,
    orcamentoAnual: 0,
    gastoAcumulado: 0,
  });
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [todosOsFuncionarios, setTodosOsFuncionarios] = useState<any[]>([]);
  const [funcionariosDisponiveis, setFuncionariosDisponiveis] = useState<any[]>([]);
  const [mostrarModalVincular, setMostrarModalVincular] = useState(false);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<string>("");
  const [vinculando, setVinculando] = useState(false);
  const [mostrarFormularioRequisicao, setMostrarFormularioRequisicao] = useState(false);
  const [criadoRequisicao, setCriadoRequisicao] = useState(false);
  const [formRequisicao, setFormRequisicao] = useState({
    observacoes: "",
    modalidade: "",
    origem: "",
  });
  const [fornecedoresLista, setFornecedoresLista] = useState<any[]>([]);
  const [buscaFornecedorReq, setBuscaFornecedorReq] = useState("");
  const [fornecedorSelecionadoReq, setFornecedorSelecionadoReq] = useState<any>(null);
  const [mostraDropdownFornecedores, setMostraDropdownFornecedores] = useState(false);
  const [contratosDoFornecedor, setContratosDoFornecedor] = useState<any[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(false);
  const [contratoSelecionadoReq, setContratoSelecionadoReq] = useState<any>(null);
  const [objetosDoContrato, setObjetosDoContrato] = useState<any[]>([]);
  const [carregandoObjetos, setCarregandoObjetos] = useState(false);
  const [objetoSelecionadoReq, setObjetoSelecionadoReq] = useState<any>(null);
  const [quantidadeInputObjeto, setQuantidadeInputObjeto] = useState<Record<string, number>>({});
  const [itensRequisicao, setItensRequisicao] = useState<any[]>([]);
  const [objetosConsumidos, setObjetosConsumidos] = useState<Record<string, number>>({});
  const [requisicoesCriadas, setRequisicoesCriadas] = useState<any[]>([]);
  const [carregandoRequisicoes, setCarregandoRequisicoes] = useState(false);
  const [requisicoesSelecionadas, setRequisicoesSelecionadas] = useState<Set<string>>(new Set());
  const [deletandoEmMassa, setDeletandoEmMassa] = useState(false);
  const [requisicaoSelecionadaDetalhes, setRequisicaoSelecionadaDetalhes] = useState<any>(null);
  const [contratoDetalhes, setContratoDetalhes] = useState<any>(null);
  const [fornecedorDetalhes, setFornecedorDetalhes] = useState<any>(null);
  const [secretarioResponsavel, setSecretarioResponsavel] = useState<any>(null);
  const [termoBusca, setTermoBusca] = useState("");

  useEffect(() => {
    // Recarregar prefeitura para obter logo_url atualizada
    if (requisicaoSelecionadaDetalhes && secretaria?.prefeitura_id) {
      loadPrefeitura(secretaria.prefeitura_id);
    }

    // Buscar contrato e fornecedor quando requisição for selecionada
    if (requisicaoSelecionadaDetalhes?.contrato_id) {
      const buscarContrato = async () => {
        try {
          const { data } = await supabase
            .from("contratos")
            .select("modalidade, origem")
            .eq("id", requisicaoSelecionadaDetalhes.contrato_id)
            .single();
          setContratoDetalhes(data);
        } catch (error) {
          console.error("Erro ao buscar contrato:", error);
        }
      };
      buscarContrato();
    }

    if (requisicaoSelecionadaDetalhes?.fornecedor_id) {
      const buscarFornecedor = async () => {
        try {
          const { data } = await supabase
            .from("fornecedores")
            .select("cnpj_cpf")
            .eq("id", requisicaoSelecionadaDetalhes.fornecedor_id)
            .single();
          setFornecedorDetalhes(data);
        } catch (error) {
          console.error("Erro ao buscar fornecedor:", error);
        }
      };
      buscarFornecedor();
    }
  }, [requisicaoSelecionadaDetalhes]);

  useEffect(() => {
    // Armazenar ID da secretária atual
    if (id) {
      localStorage.setItem("secretaria_atual_id", id);
      carregarRequisicoesCriadas();
    }
    checkAuth();
  }, [id, router]);

  const checkAuth = async () => {
    const prefeituraSession = localStorage.getItem("prefeitura_session");

    if (!prefeituraSession) {
      router.push(`/login?redirect=/secretaria/${id}`);
      return;
    }

    try {
      const session = JSON.parse(prefeituraSession);

      // Armazenar nome do usuário
      if (session.nome) {
        setUserName(session.nome);
      }

      if (session.tipo === "funcionario") {
        const { data: funcionario, error: funcError } = await supabase
          .from("funcionarios")
          .select("secretaria_id")
          .eq("id", session.id)
          .single();

        if (funcError || !funcionario) {
          setErro("Funcionário não encontrado.");
          setLoading(false);
          return;
        }

        if (funcionario.secretaria_id === id) {
          await loadSecretaria();
          return;
        }

        const { data: vinculacao, error: vinError } = await supabase
          .from("funcionario_secretarias")
          .select("*")
          .eq("funcionario_id", session.id)
          .eq("secretaria_id", id)
          .maybeSingle();

        if (!vinError && vinculacao) {
          await loadSecretaria();
          return;
        }

        setErro("Você não tem acesso a esta secretaria.");
        setLoading(false);
        return;
      }

      await loadSecretaria();
    } catch (error) {
      console.error("Erro ao verificar acesso:", error);
      setErro("Erro ao verificar acesso");
      setLoading(false);
    }
  };

  const loadSecretaria = async () => {
    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setSecretaria(data);

      // Carregar dados da prefeitura
      await loadPrefeitura(data.prefeitura_id);

      // Carregar dados do dashboard após secretaria ser carregada
      await loadDashboardDataWithPrefeitura(data.prefeitura_id);

      // Carregar funcionários da secretaria
      await loadFuncionarios();

      // Carregar secretário responsável
      await loadSecretarioResponsavel();
    } catch (error) {
      console.error("Erro ao carregar secretaria:", error);
      setErro("Secretaria não encontrada");
    } finally {
      setLoading(false);
    }
  };

  const loadPrefeitura = async (prefeituraId: string) => {
    try {
      const { data, error } = await supabase
        .from("prefeituras")
        .select("nome, estado, cidade, logo_url")
        .eq("id", prefeituraId)
        .single();

      if (data) {
        setPrefeitura(data);
      }
    } catch (error) {
      console.error("Erro ao carregar prefeitura:", error);
    }
  };

  const loadSecretarioResponsavel = async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("nome, cargo")
        .eq("secretaria_id", id)
        .ilike("cargo", "%secretario%")
        .single();

      if (data) {
        setSecretarioResponsavel(data);
      }
    } catch (error) {
      console.error("Erro ao carregar secretário responsável:", error);
    }
  };

  const formatarDataBrasil = (data: Date) => {
    const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

    const dia = data.getDate();
    const mes = meses[data.getMonth()];
    const ano = data.getFullYear();

    return `${dia} de ${mes} de ${ano}`;
  };

  const loadDashboardDataWithPrefeitura = async (prefeituraId: string) => {
    try {
      const sessionKey = localStorage.getItem("admin_session") ? "admin_session" : "prefeitura_session";
      const sessionData = localStorage.getItem(sessionKey);
      const session = sessionData ? JSON.parse(sessionData) : null;

      // Verificar se usuário é secretário
      const { data: funcionario } = await supabase
        .from("funcionarios")
        .select("secretaria_id, cargo")
        .eq("id", session?.id)
        .single();

      const ehSecretario = funcionario &&
        funcionario.secretaria_id === id &&
        funcionario.cargo?.toLowerCase().includes("secretario");

      // Buscar total de funcionários da secretaria
      const { data: funcionariosData } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("secretaria_id", id);

      // Buscar total de fornecedores da prefeitura
      const { data: fornecedores } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("prefeitura_id", prefeituraId);

      // Buscar requisições: todas se secretário, apenas suas se não for
      let queryReq = supabase
        .from("requisicoes")
        .select("id")
        .eq("secretaria_id", id);

      if (!ehSecretario) {
        queryReq = queryReq.eq("criada_por", session?.id);
      }

      const { data: requisicoes } = await queryReq;

      setDashboardData((prev) => ({
        ...prev,
        totalFuncionarios: funcionariosData?.length || 0,
        totalFornecedores: fornecedores?.length || 0,
        totalRequisicoes: requisicoes?.length || 0,
      }));
    } catch (error) {
      console.error("Erro ao carregar dados do dashboard:", error);
    }
  };

  const loadFuncionarios = async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, email, cargo, telefone")
        .eq("secretaria_id", id)
        .order("nome");

      if (error) throw error;
      setFuncionarios(data || []);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
      setFuncionarios([]);
    }
  };

  const loadFuncionariosDisponiveis = async () => {
    try {
      if (!secretaria) return;

      // Buscar todos os funcionários da prefeitura que não têm secretaria_id vinculado
      const { data: disponíveis, error } = await supabase
        .from("funcionarios")
        .select("id, nome, email, cargo")
        .eq("prefeitura_id", secretaria.prefeitura_id)
        .is("secretaria_id", null)
        .not("cargo", "ilike", "%prefeito%")
        .order("nome");

      if (error) throw error;

      // Buscar solicitações pendentes para essa secretaria
      const { data: solicitacoesPendentes, error: erroSolicitacoes } = await supabase
        .from("vinculos_funcionario_pendentes")
        .select("funcionario_id")
        .eq("secretaria_id", id)
        .eq("status", "pendente");

      const idsComSolicitacao = new Set(
        (solicitacoesPendentes || []).map((s: any) => s.funcionario_id)
      );

      // Filtrar disponíveis: remover quem tem solicitação pendente
      const filtrados = (disponíveis || []).filter(
        (func) => !idsComSolicitacao.has(func.id)
      );

      setFuncionariosDisponiveis(filtrados);
    } catch (error) {
      console.error("Erro ao carregar funcionários disponíveis:", error);
    }
  };

  const buscarFornecedoresReq = async (termo: string) => {
    if (termo.trim().length < 2) {
      setFornecedoresLista([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("prefeitura_id", secretaria?.prefeitura_id)
        .or(`nome.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`)
        .limit(10);

      if (error) throw error;
      setFornecedoresLista(data || []);
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error);
    }
  };

  const carregarContratosDoFornecedor = async (fornecedorId: string) => {
    setCarregandoContratos(true);
    try {
      const { data, error } = await supabase
        .from("contratos")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContratosDoFornecedor(data || []);
    } catch (error) {
      console.error("Erro ao carregar contratos:", error);
      setContratosDoFornecedor([]);
    } finally {
      setCarregandoContratos(false);
    }
  };

  const carregarObjetosDoContrato = async (contratoId: string) => {
    setCarregandoObjetos(true);
    try {
      const { data, error } = await supabase
        .from("objetos_contratos")
        .select("*")
        .eq("contrato_id", contratoId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Buscar consumo de cada objeto
      const objetoIds = (data || []).map(o => o.id);
      const { data: consumoData } = await supabase
        .from("consumo_objetos")
        .select("objeto_id, quantidade_usada")
        .in("objeto_id", objetoIds);

      // Calcular consumo total por objeto
      const consumoMap: Record<string, number> = {};
      (consumoData || []).forEach(c => {
        consumoMap[c.objeto_id] = (consumoMap[c.objeto_id] || 0) + c.quantidade_usada;
      });

      // Adicionar quantidade disponível aos objetos
      const objetosComConsumo = (data || []).map(obj => ({
        ...obj,
        consumido: consumoMap[obj.id] || 0,
        disponivel: obj.quantidade - (consumoMap[obj.id] || 0)
      }));

      setObjetosDoContrato(objetosComConsumo);
      setObjetosConsumidos(consumoMap);
    } catch (error) {
      console.error("Erro ao carregar objetos:", error);
      setObjetosDoContrato([]);
    } finally {
      setCarregandoObjetos(false);
    }
  };

  const adicionarItemRequisicao = (objeto: any) => {
    const quantidade = quantidadeInputObjeto[objeto.id];

    if (!quantidade || quantidade <= 0) {
      alert("Digite uma quantidade válida");
      return;
    }

    if (quantidade > (objeto.quantidade - (objetosConsumidos[objeto.id] || 0))) {
      alert(`Quantidade indisponível. Disponível: ${objeto.quantidade - (objetosConsumidos[objeto.id] || 0)}`);
      return;
    }

    const itemExistente = itensRequisicao.find((i) => i.objetoId === objeto.id);

    if (itemExistente) {
      const itensAtualizados = itensRequisicao.map((i) =>
        i.objetoId === objeto.id
          ? {
              ...i,
              quantidade: i.quantidade + quantidade,
              valorTotal: (i.quantidade + quantidade) * objeto.valor_unitario,
            }
          : i
      );
      setItensRequisicao(itensAtualizados);
    } else {
      const novoItem = {
        id: `${objeto.id}-${Date.now()}`,
        objetoId: objeto.id,
        descricao: objeto.descricao,
        quantidade: quantidade,
        valorUnitario: objeto.valor_unitario,
        valorTotal: quantidade * objeto.valor_unitario,
      };
      setItensRequisicao([...itensRequisicao, novoItem]);
    }

    setObjetosConsumidos({
      ...objetosConsumidos,
      [objeto.id]: (objetosConsumidos[objeto.id] || 0) + quantidade,
    });
    setQuantidadeInputObjeto({ ...quantidadeInputObjeto, [objeto.id]: 0 });
  };

  const removerItemRequisicao = (itemId: string) => {
    const item = itensRequisicao.find((i) => i.id === itemId);
    if (!item) return;

    setItensRequisicao(itensRequisicao.filter((i) => i.id !== itemId));
    const novoConsumido = (objetosConsumidos[item.objetoId] || 0) - item.quantidade;
    setObjetosConsumidos({
      ...objetosConsumidos,
      [item.objetoId]: novoConsumido <= 0 ? 0 : novoConsumido,
    });
  };

  const deletarRequisicao = async (requisicaoId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta requisição?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("requisicoes")
        .delete()
        .eq("id", requisicaoId);

      if (error) throw error;

      alert("Requisição excluída com sucesso!");
      await carregarRequisicoesCriadas();
    } catch (error) {
      console.error("Erro ao deletar requisição:", error);
      alert("Erro ao excluir requisição");
    }
  };

  const deletarRequisicaoEmMassa = async () => {
    if (requisicoesSelecionadas.size === 0) {
      alert("Selecione pelo menos uma requisição");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${requisicoesSelecionadas.size} requisição(ões)?`)) {
      return;
    }

    setDeletandoEmMassa(true);
    try {
      const { error } = await supabase
        .from("requisicoes")
        .delete()
        .in("id", Array.from(requisicoesSelecionadas));

      if (error) throw error;

      alert("Requisições excluídas com sucesso!");
      setRequisicoesSelecionadas(new Set());
      await carregarRequisicoesCriadas();
    } catch (error) {
      console.error("Erro ao deletar requisições:", error);
      alert("Erro ao excluir requisições");
    } finally {
      setDeletandoEmMassa(false);
    }
  };

  const toggleSelecionarTodos = () => {
    if (requisicoesSelecionadas.size === requisicoesCriadas.length) {
      setRequisicoesSelecionadas(new Set());
    } else {
      setRequisicoesSelecionadas(new Set(requisicoesCriadas.map((r) => r.id)));
    }
  };

  const toggleSelecionar = (requisicaoId: string) => {
    const nova = new Set(requisicoesSelecionadas);
    if (nova.has(requisicaoId)) {
      nova.delete(requisicaoId);
    } else {
      nova.add(requisicaoId);
    }
    setRequisicoesSelecionadas(nova);
  };

  const carregarRequisicoesCriadas = async () => {
    setCarregandoRequisicoes(true);
    try {
      const sessionKey = localStorage.getItem("admin_session") ? "admin_session" : "prefeitura_session";
      const sessionData = localStorage.getItem(sessionKey);
      const session = sessionData ? JSON.parse(sessionData) : null;

      // Verificar se usuário é secretário da secretaria atual
      const { data: funcionario, error: erroFunc } = await supabase
        .from("funcionarios")
        .select("secretaria_id, cargo")
        .eq("id", session?.id)
        .single();

      const ehSecretario = funcionario &&
        funcionario.secretaria_id === id &&
        funcionario.cargo?.toLowerCase().includes("secretario");

      let query = supabase
        .from("requisicoes")
        .select("*")
        .eq("secretaria_id", id)
        .order("created_at", { ascending: false });

      // Se não é secretário dessa secretaria, filtra apenas suas requisições
      if (!ehSecretario) {
        query = query.eq("criada_por", session?.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Buscar nomes dos criadores
      if (data && data.length > 0) {
        const criadoresIds = [...new Set(data.map((r: any) => r.criada_por))];
        const { data: criadores } = await supabase
          .from("funcionarios")
          .select("id, nome")
          .in("id", criadoresIds);

        const criadoresMap = new Map(
          (criadores || []).map((c: any) => [c.id, c.nome])
        );

        // Buscar itens das requisições
        const requisicaoIds = data.map((r: any) => r.id);
        const { data: itens } = await supabase
          .from("requisicoes_itens")
          .select("*")
          .in("requisicao_id", requisicaoIds);

        const itensMap = new Map();
        (itens || []).forEach((item: any) => {
          if (!itensMap.has(item.requisicao_id)) {
            itensMap.set(item.requisicao_id, []);
          }
          itensMap.get(item.requisicao_id).push(item);
        });

        // Adicionar nome do criador e itens a cada requisição
        const dataComDados = data.map((r: any) => ({
          ...r,
          criador_nome: criadoresMap.get(r.criada_por) || "Desconhecido",
          itens: itensMap.get(r.id) || [],
        }));

        setRequisicoesCriadas(dataComDados);
      } else {
        setRequisicoesCriadas([]);
      }
    } catch (error) {
      console.error("Erro ao carregar requisições:", error);
      setRequisicoesCriadas([]);
    } finally {
      setCarregandoRequisicoes(false);
    }
  };

  const gerarNumeroRequisicao = () => {
    const agora = new Date();
    const data = agora.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const hora = agora.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    const aleatorio = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `REQ-${data}-${hora}-${aleatorio}`;
  };

  const criarRequisicao = async () => {
    if (itensRequisicao.length === 0) {
      alert("Adicione pelo menos um item à requisição");
      return;
    }

    try {
      const sessionKey = localStorage.getItem("admin_session") ? "admin_session" : "prefeitura_session";
      const sessionData = localStorage.getItem(sessionKey);
      const session = sessionData ? JSON.parse(sessionData) : null;

      const numeroRequisicao = gerarNumeroRequisicao();

      console.log("Criando requisição com dados:", {
        secretaria_id: id,
        prefeitura_id: secretaria?.prefeitura_id,
        numero_requisicao: numeroRequisicao,
        session: session,
      });

      const { error, data } = await supabase
        .from("requisicoes")
        .insert([
          {
            secretaria_id: id,
            prefeitura_id: secretaria?.prefeitura_id,
            numero_requisicao: numeroRequisicao,
            titulo: `Requisição ${numeroRequisicao} - ${new Date().toLocaleDateString("pt-BR")}`,
            descricao: formRequisicao.observacoes || "",
            status: "pendente",
            solicitante_id: session?.id,
            criada_por: session?.id,
            criador_nome: session?.nome || "Usuário",
            fornecedor_id: fornecedorSelecionadoReq?.id,
            fornecedor_nome: fornecedorSelecionadoReq?.nome,
            contrato_id: contratoSelecionadoReq?.id,
            contrato_numero: contratoSelecionadoReq?.numero,
          },
        ])
        .select();

      console.log("Resposta do insert:", { data, error });

      if (error) {
        console.error("Erro detalhado:", error);
        throw new Error(error.message || "Erro ao criar requisição");
      }

      // Salvar itens da requisição
      if (data && data.length > 0 && itensRequisicao.length > 0) {
        const requisicaoId = data[0].id;
        const itensParaSalvar = itensRequisicao.map((item) => ({
          requisicao_id: requisicaoId,
          objeto_contrato_id: item.objetoId,
          quantidade: item.quantidade,
          valor_unitario: item.valorUnitario,
          valor_total: item.valorTotal,
        }));

        const { error: erroItens } = await supabase
          .from("requisicoes_itens")
          .insert(itensParaSalvar);

        if (erroItens) {
          console.error("Erro ao salvar itens:", erroItens);
        }

        // Registrar consumo de cada item (subtrair quantidade disponível)
        const consumoParaSalvar = itensRequisicao.map((item) => ({
          objeto_id: item.objetoId,
          quantidade_usada: item.quantidade,
          requisicao_id: requisicaoId,
          tipo: "requisicao",
        }));

        const { error: erroConsumo } = await supabase
          .from("consumo_objetos")
          .insert(consumoParaSalvar);

        if (erroConsumo) {
          console.error("Erro ao registrar consumo:", erroConsumo);
        } else {
          console.log("Consumo registrado com sucesso para", consumoParaSalvar.length, "itens");
        }
      }

      setCriadoRequisicao(true);

      // Limpar formulário
      setFormRequisicao({ observacoes: "", modalidade: "", origem: "" });
      setItensRequisicao([]);
      setQuantidadeInputObjeto({});
      setObjetosConsumidos({});
      setBuscaFornecedorReq("");
      setFornecedorSelecionadoReq(null);
      setContratosDoFornecedor([]);
      setContratoSelecionadoReq(null);
      setObjetosDoContrato([]);
      setObjetoSelecionadoReq(null);

      setMostrarFormularioRequisicao(false);
      await loadDashboardDataWithPrefeitura(secretaria!.prefeitura_id);
      await carregarRequisicoesCriadas();

      setTimeout(() => setCriadoRequisicao(false), 3000);
    } catch (error: any) {
      console.error("Erro ao criar requisição:", error?.message || error);
      alert(`Erro: ${error?.message || "Erro ao criar requisição"}`);
    }
  };

  const vincularFuncionario = async () => {
    if (!funcionarioSelecionado || !secretaria) return;

    setVinculando(true);
    try {
      // Obter dados da sessão (secretário que está fazendo a solicitação)
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      const session = prefeituraSession ? JSON.parse(prefeituraSession) : null;
      const solicitanteId = session?.id;

      if (!solicitanteId) {
        throw new Error("Não foi possível identificar o solicitante");
      }

      // Buscar ID do Prefeito da prefeitura
      const { data: prefeitoData, error: prefeitoError } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("prefeitura_id", secretaria.prefeitura_id)
        .eq("cargo", "prefeito")
        .limit(1)
        .single();

      if (prefeitoError || !prefeitoData) {
        console.error("Erro ao buscar Prefeito:", prefeitoError);
        throw new Error("Prefeito não encontrado nesta prefeitura");
      }

      // Buscar nome do funcionário selecionado
      const funcSelecionado = funcionariosDisponiveis.find(
        (f) => f.id === funcionarioSelecionado
      );

      // Criar solicitação pendente
      const { data: vincuoloData, error: vinculoError } = await supabase
        .from("vinculos_funcionario_pendentes")
        .insert({
          funcionario_id: funcionarioSelecionado,
          secretaria_id: id,
          prefeitura_id: secretaria.prefeitura_id,
          solicitante_id: solicitanteId,
          status: "pendente",
        })
        .select()
        .single();

      if (vinculoError) throw vinculoError;

      // Criar notificação para o Prefeito
      const { error: notifError } = await supabase
        .from("notificacoes")
        .insert({
          tipo: "vinculo_funcionario_pendente",
          usuario_id: prefeitoData.id,
          prefeitura_id: secretaria.prefeitura_id,
          referencia_id: vincuoloData.id,
          mensagem: `Solicitação de vinculação de ${funcSelecionado?.nome || "um funcionário"} à secretaria "${secretaria.nome}"`,
        });

      if (notifError) throw notifError;

      setMostrarModalVincular(false);
      setFuncionarioSelecionado("");

      // Mostrar mensagem de sucesso
      alert("Solicitação enviada ao Prefeito! Aguarde aprovação.");
    } catch (error) {
      console.error("Erro ao criar solicitação:", error);
      alert("Erro ao enviar solicitação");
    } finally {
      setVinculando(false);
    }
  };


  const handleLogout = () => {
    localStorage.removeItem("prefeitura_session");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (erro || !secretaria) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">⚠️ Erro</h1>
          <p className="text-gray-600 mb-6">{erro || "Secretaria não encontrada"}</p>
          <button
            onClick={() => router.back()}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title={secretaria?.nome || "Secretaria"}
        subtitle={secretaria?.descricao || "Gerenciamento da Secretaria"}
        tabs={[
          { id: "dashboard", label: "Dashboard" },
          { id: "funcionarios", label: "Funcionários" },
          { id: "notasfiscais", label: "Notas Fiscais" },
          { id: "fornecedores", label: "Fornecedores" },
          { id: "requisicoes", label: "Requisições" },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName={userName}
        userRole="Acesso"
      />

      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">📂</h1>
          <h2 className="text-lg font-bold text-gray-900 mt-2">{secretaria.nome}</h2>
          <p className="text-sm text-gray-500 mt-1">Gerenciamento da Secretaria</p>
        </div>

        <nav className="space-y-2 flex-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeTab === "dashboard"
                ? "bg-orange-100 text-orange-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Home size={20} />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab("funcionarios")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeTab === "funcionarios"
                ? "bg-orange-100 text-orange-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Users size={20} />
            Funcionários
          </button>

          <button
            onClick={() => setActiveTab("notasfiscais")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeTab === "notasfiscais"
                ? "bg-orange-100 text-orange-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <FileText size={20} />
            Notas Fiscais
          </button>

          <button
            onClick={() => setActiveTab("fornecedores")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeTab === "fornecedores"
                ? "bg-orange-100 text-orange-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Building2 size={20} />
            Fornecedores
          </button>

          <button
            onClick={() => setActiveTab("requisicoes")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeTab === "requisicoes"
                ? "bg-orange-100 text-orange-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <FileText size={20} />
            Requisições
          </button>
        </nav>

        <div className="border-t border-gray-200 pt-4">
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800 font-medium mb-2">📧 Email</p>
            <a href={`mailto:${secretaria.email}`} className="text-xs text-blue-600 hover:text-blue-700 break-all">
              {secretaria.email}
            </a>
            <p className="text-sm text-blue-800 font-medium mt-3 mb-2">📞 Telefone</p>
            <a href={`tel:${secretaria.telefone}`} className="text-xs text-blue-600 hover:text-blue-700">
              {secretaria.telefone}
            </a>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded-lg transition font-medium text-sm"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium mb-4"
          >
            ← Voltar
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{secretaria.nome}</h1>
          <p className="text-gray-600 mt-2">{secretaria.descricao || "Gerenciamento de secretaria"}</p>
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Informações da Secretaria - Movido para o topo */}
            <div className="bg-white rounded-lg shadow p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">📋 Informações da Secretaria</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Nome</p>
                  <p className="text-gray-900 text-lg">{secretaria.nome}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Email</p>
                  <a href={`mailto:${secretaria.email}`} className="text-blue-600 hover:text-blue-700">
                    {secretaria.email}
                  </a>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Telefone</p>
                  <a href={`tel:${secretaria.telefone}`} className="text-blue-600 hover:text-blue-700">
                    {secretaria.telefone}
                  </a>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Descrição</p>
                  <p className="text-gray-700">{secretaria.descricao || "Sem descrição"}</p>
                </div>
              </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => {
                  loadFuncionarios();
                  setActiveTab("funcionarios");
                }}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer text-left"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Funcionários</p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">{dashboardData.totalFuncionarios}</p>
                  </div>
                  <div className="text-3xl">👥</div>
                </div>
              </button>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Notas Fiscais</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{dashboardData.totalNotasFiscais}</p>
                  </div>
                  <div className="text-3xl">📄</div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Fornecedores</p>
                    <p className="text-3xl font-bold text-green-600 mt-2">{dashboardData.totalFornecedores}</p>
                  </div>
                  <div className="text-3xl">🏢</div>
                </div>
              </div>

              <div
                onClick={() => setActiveTab("requisicoes")}
                className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Requisições</p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">{dashboardData.totalRequisicoes}</p>
                  </div>
                  <div className="text-3xl">📋</div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Orçamento Anual</p>
                    <p className="text-3xl font-bold text-purple-600 mt-2">R$ 0</p>
                  </div>
                  <div className="text-3xl">💰</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Funcionários Tab */}
        {activeTab === "funcionarios" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">👥 Funcionários</h2>
              <button
                onClick={() => {
                  loadFuncionariosDisponiveis();
                  setMostrarModalVincular(true);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition"
              >
                <span className="text-lg">+</span>
                <span>Vincular</span>
              </button>
            </div>

            {funcionarios.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {funcionarios.map((func) => {
                  const ehSecretario = func.cargo?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes("secretario");
                  return (
                  <div
                    key={func.id}
                    className={`rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 ${
                      ehSecretario
                        ? "bg-gradient-to-br from-yellow-50 to-amber-50 border-amber-400 hover:border-amber-500 hover:shadow-lg"
                        : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-200"
                    }`}
                  >
                    {/* Badge de Secretário */}
                    {ehSecretario && (
                      <div className="mb-3 inline-block bg-amber-200 text-amber-900 px-3 py-1 rounded-full text-xs font-bold">
                        👑 Secretário
                      </div>
                    )}

                    {/* Header com Avatar e Botão Desvincular */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                        {func.nome.charAt(0).toUpperCase()}
                      </div>
                      <button className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded text-xs font-medium transition">
                        Desvincular
                      </button>
                    </div>

                    {/* Info */}
                    <div className="mb-4">
                      <p className="font-bold text-gray-900 text-lg truncate">{func.nome}</p>
                      <p className="text-xs font-medium text-orange-600 mt-1 truncate">
                        {func.cargo || "Sem cargo"}
                      </p>
                    </div>

                    {/* Contato */}
                    <div className="space-y-2 mb-4">
                      {func.email && (
                        <a
                          href={`mailto:${func.email}`}
                          className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 transition truncate group"
                          title={func.email}
                        >
                          <span className="text-sm">📧</span>
                          <span className="truncate group-hover:underline">{func.email}</span>
                        </a>
                      )}
                      {func.telefone && (
                        <a
                          href={`tel:${func.telefone}`}
                          className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 transition"
                        >
                          <span className="text-sm">📞</span>
                          <span>{func.telefone}</span>
                        </a>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-200 pt-4">
                      <button className="w-full text-center text-xs font-medium text-orange-600 hover:text-orange-700 py-2 rounded-lg hover:bg-orange-50 transition">
                        Ver perfil
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <p className="text-2xl mb-2">👤</p>
                <p className="text-gray-600 font-medium">Nenhum funcionário cadastrado</p>
                <p className="text-sm text-gray-500 mt-2">Esta secretaria não possui funcionários no momento</p>
              </div>
            )}
          </div>
        )}

        {/* Notas Fiscais Tab */}
        {activeTab === "notasfiscais" && (
          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">📄 Notas Fiscais</h2>
            <div className="text-center py-12">
              <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
              <p className="text-sm text-gray-500 mt-2">Esta seção mostrará as notas fiscais emitidas</p>
            </div>
          </div>
        )}

        {/* Fornecedores Tab */}
        {activeTab === "fornecedores" && (
          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">🏢 Fornecedores</h2>
            <div className="text-center py-12">
              <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
              <p className="text-sm text-gray-500 mt-2">Esta seção mostrará os fornecedores cadastrados</p>
            </div>
          </div>
        )}

        {/* Requisições Tab */}
        {activeTab === "requisicoes" && (
          <div className="space-y-6">
            {criadoRequisicao && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                ✅ Requisição criada com sucesso!
              </div>
            )}

            {mostrarFormularioRequisicao && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Nova Requisição</h2>
                  <button
                    onClick={() => setMostrarFormularioRequisicao(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  {!fornecedorSelecionadoReq && (
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Buscar Fornecedor
                      </label>
                      <input
                        type="text"
                        value={buscaFornecedorReq}
                        onChange={(e) => {
                          setBuscaFornecedorReq(e.target.value);
                          buscarFornecedoresReq(e.target.value);
                          setMostraDropdownFornecedores(true);
                        }}
                        onFocus={() => setMostraDropdownFornecedores(true)}
                        placeholder="Digite nome ou CNPJ do fornecedor"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />

                      {mostraDropdownFornecedores && fornecedoresLista.length > 0 && (
                        <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                          {fornecedoresLista.map((forn) => (
                            <button
                              key={forn.id}
                              type="button"
                              onClick={() => {
                                setFornecedorSelecionadoReq(forn);
                                setBuscaFornecedorReq(forn.nome);
                                setMostraDropdownFornecedores(false);
                                carregarContratosDoFornecedor(forn.id);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-orange-50 transition border-b last:border-b-0"
                            >
                              <p className="font-medium text-gray-900">{forn.nome}</p>
                              <p className="text-xs text-gray-500">{forn.cnpj_cpf}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {fornecedorSelecionadoReq && (
                    <>
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900">✓ {fornecedorSelecionadoReq.nome}</p>
                          <p className="text-gray-600">{fornecedorSelecionadoReq.cnpj_cpf}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFornecedorSelecionadoReq(null);
                            setBuscaFornecedorReq("");
                            setContratoSelecionadoReq(null);
                            setContratosDoFornecedor([]);
                          }}
                          className="text-blue-600 hover:text-blue-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {!contratoSelecionadoReq && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="font-medium text-gray-900 mb-3">Contratos Disponíveis:</p>
                          {carregandoContratos ? (
                            <p className="text-gray-600 text-sm">Carregando contratos...</p>
                          ) : contratosDoFornecedor.length > 0 ? (
                            <div className="space-y-2">
                              {contratosDoFornecedor.map((contrato) => (
                                <button
                                  key={contrato.id}
                                  type="button"
                                  onClick={() => {
                                    setContratoSelecionadoReq(contrato);
                                    setFormRequisicao({
                                      ...formRequisicao,
                                      modalidade: contrato.modalidade || "",
                                      origem: contrato.origem || "",
                                    });
                                    carregarObjetosDoContrato(contrato.id);
                                  }}
                                  className="w-full text-left p-2 bg-white border border-gray-300 rounded text-sm hover:bg-orange-50 transition"
                                >
                                  <p className="font-medium text-gray-900">Contrato nº {contrato.numero}</p>
                                  <p className="text-gray-600">{contrato.descricao}</p>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm">Nenhum contrato encontrado para este fornecedor</p>
                          )}
                        </div>
                      )}

                      {contratoSelecionadoReq && (
                        <>
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">✓ Contrato nº {contratoSelecionadoReq.numero}</p>
                              <p className="text-gray-600">{contratoSelecionadoReq.descricao}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setContratoSelecionadoReq(null);
                                setObjetoSelecionadoReq(null);
                                setObjetosDoContrato([]);
                              }}
                              className="text-green-600 hover:text-green-700 font-bold ml-2"
                            >
                              ✕
                            </button>
                          </div>

                          {!objetoSelecionadoReq && (
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="flex items-center justify-between mb-3">
                                <p className="font-medium text-gray-900">Objetos do Contrato:</p>
                                <button
                                  type="button"
                                  onClick={() => setContratoSelecionadoReq(null)}
                                  className="text-yellow-600 hover:text-yellow-700 font-bold"
                                >
                                  ✕
                                </button>
                              </div>
                              {carregandoObjetos ? (
                                <p className="text-gray-600 text-sm">Carregando objetos...</p>
                              ) : objetosDoContrato.length > 0 ? (
                                <div className="space-y-3">
                                  {objetosDoContrato.map((objeto) => {
                                    const consumido = objetosConsumidos[objeto.id] || 0;
                                    const disponivel = objeto.quantidade - consumido;
                                    const percentualConsumo = objeto.quantidade > 0 ? (consumido / objeto.quantidade) * 100 : 0;
                                    return (
                                      <div
                                        key={objeto.id}
                                        className="p-3 bg-white border border-yellow-300 rounded text-sm"
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <p className="font-medium text-gray-900">{objeto.descricao}</p>
                                          <span className="text-xs font-semibold text-yellow-700 bg-yellow-200 px-2 py-1 rounded">{percentualConsumo.toFixed(0)}%</span>
                                        </div>
                                        <p className="text-gray-600 text-xs mb-2">
                                          Valor Unit.: R$ {objeto.valor_unitario ? objeto.valor_unitario.toFixed(2) : "0,00"}
                                          {objeto.quantidade && ` | Qtd Disponível: ${disponivel}/${objeto.quantidade}`}
                                        </p>
                                        <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden mb-3">
                                          <div
                                            className={`h-full rounded-full transition-all ${
                                              percentualConsumo < 25
                                                ? "bg-green-500"
                                                : percentualConsumo < 50
                                                ? "bg-blue-500"
                                                : percentualConsumo < 75
                                                ? "bg-orange-500"
                                                : "bg-red-500"
                                            }`}
                                            style={{ width: `${percentualConsumo}%` }}
                                          />
                                        </div>
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="number"
                                            min="1"
                                            max={disponivel}
                                            value={quantidadeInputObjeto[objeto.id] || ""}
                                            onChange={(e) =>
                                              setQuantidadeInputObjeto({
                                                ...quantidadeInputObjeto,
                                                [objeto.id]: parseInt(e.target.value) || 0,
                                              })
                                            }
                                            placeholder="Qtd"
                                            disabled={disponivel === 0}
                                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => adicionarItemRequisicao(objeto)}
                                            disabled={disponivel === 0}
                                            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition ${
                                              disponivel === 0
                                                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                                                : "bg-orange-600 hover:bg-orange-700 text-white"
                                            }`}
                                          >
                                            {disponivel === 0 ? "Indisponível" : "Adicionar"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-gray-500 text-sm">Nenhum objeto encontrado para este contrato</p>
                              )}
                            </div>
                          )}

                          {itensRequisicao.length > 0 && (
                            <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-900">Itens da Requisição</h3>
                                <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">{itensRequisicao.length} item(ns)</span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium text-gray-700">Item</th>
                                      <th className="px-3 py-2 text-left font-medium text-gray-700">Descrição</th>
                                      <th className="px-3 py-2 text-center font-medium text-gray-700">Qtd</th>
                                      <th className="px-3 py-2 text-right font-medium text-gray-700">R$ Unit.</th>
                                      <th className="px-3 py-2 text-right font-medium text-gray-700">R$ Total</th>
                                      <th className="px-3 py-2 text-center font-medium text-gray-700">Ação</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {itensRequisicao.map((item, index) => (
                                      <tr key={item.id} className="hover:bg-gray-50 transition">
                                        <td className="px-3 py-2 text-gray-900 font-medium">{index + 1}</td>
                                        <td className="px-3 py-2 text-gray-700">{item.descricao}</td>
                                        <td className="px-3 py-2 text-center text-gray-700">{item.quantidade}</td>
                                        <td className="px-3 py-2 text-right text-gray-700">R$ {item.valorUnitario.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right font-medium text-gray-900">R$ {item.valorTotal.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-center">
                                          <button
                                            type="button"
                                            onClick={() => removerItemRequisicao(item.id)}
                                            className="text-red-600 hover:text-red-700 font-bold"
                                          >
                                            ✕
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                                    <tr>
                                      <td colSpan={4} className="px-3 py-3 text-right font-bold text-gray-900">
                                        Valor Total:
                                      </td>
                                      <td className="px-3 py-3 text-right font-bold text-lg text-orange-600">
                                        R$ {itensRequisicao.reduce((sum, item) => sum + item.valorTotal, 0).toFixed(2)}
                                      </td>
                                      <td></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          )}

                          {objetoSelecionadoReq && (
                            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">✓ {objetoSelecionadoReq.descricao}</p>
                                <p className="text-gray-600">
                                  Valor Unit.: R$ {objetoSelecionadoReq.valor_unitario ? objetoSelecionadoReq.valor_unitario.toFixed(2) : "0,00"}
                                  {objetoSelecionadoReq.quantidade && ` | Qtd: ${objetoSelecionadoReq.quantidade}`}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setObjetoSelecionadoReq(null)}
                                className="text-purple-600 hover:text-purple-700 font-bold ml-2"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={formRequisicao.observacoes}
                      onChange={(e) =>
                        setFormRequisicao({ ...formRequisicao, observacoes: e.target.value })
                      }
                      placeholder="Digite observações adicionais (opcional)"
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={criarRequisicao}
                      className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
                    >
                      Criar Requisição
                    </button>
                    <button
                      onClick={() => setMostrarFormularioRequisicao(false)}
                      className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">📋 Minhas Requisições</h2>
                <div className="flex gap-2">
                  {requisicoesSelecionadas.size > 0 && (
                    <button
                      onClick={deletarRequisicaoEmMassa}
                      disabled={deletandoEmMassa}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                    >
                      🗑️ Deletar {requisicoesSelecionadas.size}
                    </button>
                  )}
                  <button
                    onClick={() => setMostrarFormularioRequisicao(!mostrarFormularioRequisicao)}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
                  >
                    + Nova Requisição
                  </button>
                </div>
              </div>
              {carregandoRequisicoes ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">Carregando requisições...</p>
                </div>
              ) : requisicoesCriadas.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">Nenhuma requisição criada por você</p>
                  <p className="text-sm text-gray-500 mt-2">Clique em "+ Nova Requisição" para criar</p>
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="🔍 Buscar por número, nome, fornecedor ou criador..."
                      value={termoBusca}
                      onChange={(e) => setTermoBusca(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  {requisicoesCriadas.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={requisicoesSelecionadas.size === requisicoesCriadas.length && requisicoesCriadas.length > 0}
                        onChange={toggleSelecionarTodos}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        {requisicoesSelecionadas.size > 0
                          ? `${requisicoesSelecionadas.size} selecionada(s)`
                          : "Selecionar tudo"}
                      </span>
                    </div>
                  )}
                  <div className="divide-y">
                    {requisicoesCriadas
                      .filter((req) => {
                        const termo = termoBusca.toLowerCase();
                        return (
                          (req.numero_requisicao?.toLowerCase().includes(termo)) ||
                          (req.titulo?.toLowerCase().includes(termo)) ||
                          (req.fornecedor_nome?.toLowerCase().includes(termo)) ||
                          (req.criador_nome?.toLowerCase().includes(termo))
                        );
                      })
                      .map((req) => (
                      <div
                        key={req.id}
                        className="p-3 hover:bg-gray-50 transition flex items-center gap-2 flex-wrap border-b cursor-pointer"
                        onClick={() => router.push(`/secretaria/${id}/requisicoes/${req.id}`)}
                      >
                        <input
                          type="checkbox"
                          checked={requisicoesSelecionadas.has(req.id)}
                          onChange={() => toggleSelecionar(req.id)}
                          className="w-4 h-4 cursor-pointer flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                          {req.titulo}
                        </span>
                        {req.fornecedor_nome && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded whitespace-nowrap">
                            🏢 {req.fornecedor_nome}
                          </span>
                        )}
                        {req.contrato_numero && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded whitespace-nowrap">
                            📋 {req.contrato_numero}
                          </span>
                        )}
                        {req.itens && req.itens.length > 0 && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded whitespace-nowrap">
                            📦 {req.itens.length} item(ns)
                          </span>
                        )}
                        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          req.status === "pendente"
                            ? "bg-yellow-100 text-yellow-800"
                            : req.status === "aprovado"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {req.status}
                        </span>
                        <span className="text-xs text-gray-600 whitespace-nowrap">
                          {req.criador_nome}
                        </span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(req.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        <button
                          onClick={() => deletarRequisicao(req.id)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium flex-shrink-0 ml-auto"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>


      {/* Modal Vincular Funcionário */}
      {mostrarModalVincular && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Vincular Funcionário</h3>

            {funcionariosDisponiveis.length > 0 ? (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Selecione um funcionário
                  </label>
                  <select
                    value={funcionarioSelecionado}
                    onChange={(e) => setFuncionarioSelecionado(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">-- Escolha um funcionário --</option>
                    {funcionariosDisponiveis.map((func) => (
                      <option key={func.id} value={func.id}>
                        {func.nome} ({func.cargo || "Sem cargo"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setMostrarModalVincular(false);
                      setFuncionarioSelecionado("");
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={vincularFuncionario}
                    disabled={!funcionarioSelecionado || vinculando}
                    className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                  >
                    {vinculando ? "Vinculando..." : "Vincular"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-6">Todos os funcionários da prefeitura já estão vinculados a esta secretaria.</p>
                <button
                  onClick={() => setMostrarModalVincular(false)}
                  className="w-full px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-900 rounded-lg transition font-medium"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
