// Leitura automática de PDF (sem IA, OCR ou serviço externo): leitor → identificador → extrator → validação.
// Só preenche formulário para conferência: não grava nada nem cria contas a pagar.
import { lerTextoPdf, MENSAGEM_LEITURA } from './leitor';
import { extrairCertidaoFederal, extrairDas, identificarDocumento, type DadosCertidaoFederal, type DadosDas, type Extracao } from './extratores';

export * from './extratores';
export { cnpjValido } from './comum';

export type ResultadoDocumentoPdf =
  | { status: 'das'; extracao: Extracao<DadosDas> }
  | { status: 'certidao_federal'; extracao: Extracao<DadosCertidaoFederal> }
  | { status: 'nao_reconhecido' }
  | { status: 'erro'; mensagem: string };

export function analisarTexto(texto: string): ResultadoDocumentoPdf {
  const tipo = identificarDocumento(texto);
  if (tipo === 'das') return { status: 'das', extracao: extrairDas(texto) };
  if (tipo === 'certidao_federal') return { status: 'certidao_federal', extracao: extrairCertidaoFederal(texto) };
  return { status: 'nao_reconhecido' };
}

export async function lerDocumentoPdf(arquivo: File): Promise<ResultadoDocumentoPdf> {
  const r = await lerTextoPdf(arquivo);
  return r.ok ? analisarTexto(r.texto) : { status: 'erro', mensagem: MENSAGEM_LEITURA[r.motivo] };
}
