"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RequisicaoDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const secretariaId = params.id as string;
  const requisicaoId = params.requisicaoId as string;

  const [requisicao, setRequisicao] = useState<any>(null);
  const [secretaria, setSecretaria] = useState<any>(null);
  const [prefeitura, setPrefeitura] = useState<any>(null);
  const [contrato, setContrato] = useState<any>(null);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [itensContrato, setItensContrato] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDados();
  }, [requisicaoId, secretariaId]);

  const loadDados = async () => {
    try {
      const { data: req } = await supabase
        .from("requisicoes")
        .select("*")
        .eq("id", requisicaoId)
        .single();

      if (req) {
        setRequisicao(req);

        const { data: sec } = await supabase
          .from("secretarias")
          .select("*")
          .eq("id", secretariaId)
          .single();
        setSecretaria(sec);

        if (sec) {
          const { data: pref } = await supabase
            .from("prefeituras")
            .select("*")
            .eq("id", sec.prefeitura_id)
            .single();
          setPrefeitura(pref);
        }

        if (req.contrato_id) {
          const { data: cont } = await supabase
            .from("contratos")
            .select("*")
            .eq("id", req.contrato_id)
            .single();
          setContrato(cont);

          // Buscar itens adicionados especificamente nesta requisição
          const { data: itensReq, error: itensReqError } = await supabase
            .from("requisicoes_itens")
            .select("*, objetos_contratos(*)")
            .eq("requisicao_id", requisicaoId)
            .order("id", { ascending: true });

          console.log("Requisição ID:", requisicaoId);
          console.log("Total de itens da requisição:", itensReq?.length || 0);
          console.log("Itens com seus dados:", itensReq);
          console.log("Erro:", itensReqError);

          // Transformar os dados para exibição
          const itensFormatados = itensReq?.map((item: any) => ({
            id: item.id,
            objeto_contrato_id: item.objeto_contrato_id,
            descricao: item.objetos_contratos?.descricao || "-",
            marca: item.objetos_contratos?.marca || "-",
            unidade: item.objetos_contratos?.unidade || "unid",
            quantidade: item.quantidade, // QUANTIDADE ADICIONADA NA REQUISIÇÃO
            valor_unitario: item.objetos_contratos?.valor_unitario || 0,
          })) || [];

          setItensContrato(itensFormatados);
        }

        if (req.fornecedor_id) {
          const { data: forn } = await supabase
            .from("fornecedores")
            .select("*")
            .eq("id", req.fornecedor_id)
            .single();
          setFornecedor(forn);
        }
      }
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  if (!requisicao || !secretaria) {
    return <div className="p-8 text-center">Requisição não encontrada</div>;
  }

  const valorTotal = itensContrato?.reduce(
    (sum: number, item: any) => sum + (item.valor_unitario * item.quantidade || 0),
    0
  ) || 0;

  const cellStyle = {
    padding: "8px",
    border: "1px solid #000",
    fontSize: "11px"
  };

  const headerStyle = {
    ...cellStyle,
    backgroundColor: "#e8e8e8",
    fontWeight: "bold",
    textAlign: "center" as const
  };

  return (
    <div className="min-h-screen bg-white p-12" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="flex gap-4 mb-8 no-print">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          Voltar
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-orange-600 text-white rounded"
        >
          Imprimir
        </button>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Header com Logos */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            {prefeitura?.logo_url && (
              <img src={prefeitura.logo_url} alt="Logo" style={{ height: "60px" }} />
            )}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "12px", fontWeight: "bold", margin: "0" }}>ESTADO DO TOCANTINS</div>
              <div style={{ fontSize: "12px", fontWeight: "bold", margin: "0" }}>PREFEITURA MUNICIPAL DE SAMPAIO</div>
              <div style={{ fontSize: "11px", fontWeight: "bold", margin: "4px 0 0 0" }}>
                {secretaria?.nome?.toUpperCase()}
              </div>
            </div>
            {prefeitura?.logo_url && (
              <img src={prefeitura.logo_url} alt="Logo" style={{ height: "60px" }} />
            )}
          </div>
          <div style={{ fontSize: "12px", fontWeight: "bold", margin: "8px 0", textDecoration: "underline" }}>
            REQUISIÇÃO DE COMPRA/SERVIÇO
          </div>
          <div style={{ fontSize: "11px", margin: "4px 0", color: "#333" }}>
            Nº Requisição: <span style={{ fontWeight: "bold", color: "#000" }}>{requisicao?.numero_requisicao || "-"}</span>
          </div>
        </div>

        {/* DADOS DA UNIDADE SOLICITANTE */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ ...headerStyle, textAlign: "center" }}>
                DADOS DA UNIDADE SOLICITANTE
              </td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "15%" }}>NOME</td>
              <td style={cellStyle}>{secretaria?.nome}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>CNPJ</td>
              <td style={cellStyle}>{secretaria?.cnpj}</td>
            </tr>
          </tbody>
        </table>

        {/* DADOS DA CONTRATAÇÃO */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ ...headerStyle, textAlign: "center" }}>
                DADOS DA CONTRATAÇÃO
              </td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "15%" }}>MODALIDADE</td>
              <td style={cellStyle}>{contrato?.modalidade || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>Nº PROCESSO</td>
              <td style={cellStyle}>{requisicao?.numero_processo || requisicao?.contrato_numero || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>ORIGEM</td>
              <td style={cellStyle}>{contrato?.origem || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>OBJETO</td>
              <td style={cellStyle}>{contrato?.descricao || "-"}</td>
            </tr>
          </tbody>
        </table>

        {/* DADOS DO CONTRATADO */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
          <tbody>
            <tr>
              <td colSpan={4} style={{ ...headerStyle, textAlign: "center" }}>
                DADOS DO CONTRATADO
              </td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "12%" }}>NOME</td>
              <td colSpan={3} style={cellStyle}>{fornecedor?.nome || requisicao?.fornecedor_nome || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>CPF/CNPJ</td>
              <td colSpan={3} style={cellStyle}>{fornecedor?.cnpj_cpf || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "12%" }}>LOGRADOURO</td>
              <td style={cellStyle}>{fornecedor?.endereco || "-"}</td>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "10%" }}>BAIRRO</td>
              <td style={cellStyle}>{fornecedor?.bairro || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>CIDADE</td>
              <td style={cellStyle}>{fornecedor?.cidade || "-"}</td>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "10%" }}>ESTADO</td>
              <td style={cellStyle}>{fornecedor?.estado || "-"}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, fontWeight: "bold" }}>CONTATO</td>
              <td style={cellStyle}>{fornecedor?.telefone || "-"}</td>
              <td style={{ ...cellStyle, fontWeight: "bold", width: "10%" }}>E-MAIL</td>
              <td style={cellStyle}>{fornecedor?.email || "-"}</td>
            </tr>
          </tbody>
        </table>

        {/* RELAÇÃO DE ITENS */}
        {itensContrato && itensContrato.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "35%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={7} style={{ ...headerStyle, textAlign: "center" }}>
                  RELAÇÃO DE ITENS
                </td>
              </tr>
              <tr>
                <td style={{ ...headerStyle, textAlign: "center" }}>Item</td>
                <td style={{ ...headerStyle, textAlign: "left", paddingLeft: "8px" }}>Descrição</td>
                <td style={{ ...headerStyle, textAlign: "center" }}>Marca</td>
                <td style={{ ...headerStyle, textAlign: "center" }}>Un.</td>
                <td style={{ ...headerStyle, textAlign: "center" }}>Quant.</td>
                <td style={{ ...headerStyle, textAlign: "right", paddingRight: "8px" }}>R$ Unit.</td>
                <td style={{ ...headerStyle, textAlign: "right", paddingRight: "8px" }}>R$ Total</td>
              </tr>
              {itensContrato.map((item: any, idx: number) => (
                <tr key={item.id}>
                  <td style={{ ...cellStyle, textAlign: "center", fontWeight: "bold" }}>{idx + 1}</td>
                  <td style={{ ...cellStyle, paddingLeft: "8px", wordWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", minHeight: "40px" }}>{item.descricao}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{item.marca || "-"}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{item.unidade || "unid"}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{item.quantidade.toFixed(2)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", paddingRight: "8px" }}>R$ {item.valor_unitario.toFixed(2)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", paddingRight: "8px" }}>R$ {(item.quantidade * item.valor_unitario).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} style={{ ...cellStyle, fontWeight: "bold", textAlign: "right", paddingRight: "8px" }}>
                  Valor Total
                </td>
                <td style={{ ...cellStyle, fontWeight: "bold", textAlign: "right", paddingRight: "8px" }}></td>
                <td style={{ ...cellStyle, fontWeight: "bold", textAlign: "right", paddingRight: "8px", backgroundColor: "#f5f5f5" }}>
                  R$ {valorTotal.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* OBSERVAÇÕES */}
        {requisicao.descricao && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
            <tbody>
              <tr>
                <td style={{ ...headerStyle, textAlign: "center" }}>OBSERVAÇÕES</td>
              </tr>
              <tr>
                <td style={{ ...cellStyle, minHeight: "50px", verticalAlign: "top" }}>
                  {requisicao.descricao}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* DECLARAÇÃO DE ADEQUAÇÃO ORÇAMENTÁRIA */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "30px" }}>
          <tbody>
            <tr>
              <td style={{ ...headerStyle, textAlign: "center" }}>DECLARAÇÃO DE ADEQUAÇÃO ORÇAMENTÁRIA</td>
            </tr>
          </tbody>
        </table>

        {/* Assinatura */}
        <div style={{ textAlign: "center", marginTop: "40px", maxHeight: "500px" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold" }}>
            {secretaria?.nome?.toUpperCase()} - TO
          </div>
          <div style={{ fontSize: "10px", marginTop: "2px" }}>
            {prefeitura?.cidade || "Sampaio"}, Tocantins, Brasil
          </div>
          <div style={{ fontSize: "10px", marginTop: "8px", fontStyle: "italic" }}>
            Criada por: {requisicao?.criador_nome || "-"}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "40px", textAlign: "center" }}>
          <div style={{ width: "300px", borderTop: "0.5px solid #000", margin: "0 auto", marginTop: "70px", marginBottom: "10px" }}></div>
          <div style={{ fontSize: "9px" }}>
            <div>
              {secretaria?.nome?.toUpperCase()} - TO | CNPJ: {secretaria?.cnpj}
            </div>
            <div>
              www.sampaio.to.gov.br
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .max-w-5xl { max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
