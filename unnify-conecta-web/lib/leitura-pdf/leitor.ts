// Leitor de PDF NO NAVEGADOR (pdfjs-dist, já usado no editor de documentos). O arquivo não sai do computador do usuário:
// nada é enviado a serviço externo, nada é gravado e nenhum texto vai para logs. Sem OCR: PDF escaneado não tem texto.
import { LIMITES_LEITURA, normalizarTexto } from './comum';

export type ResultadoLeitura = { ok: true; texto: string } | { ok: false; motivo: 'invalido' | 'grande' | 'sem_texto' | 'protegido' | 'tempo' | 'falha' };

async function carregarPdfjs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker-6.3.289.min.mjs';
  return pdfjs;
}

export async function lerTextoPdf(arquivo: File): Promise<ResultadoLeitura> {
  if (arquivo.size === 0 || arquivo.size > LIMITES_LEITURA.bytes) return { ok: false, motivo: 'grande' };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  // Formato real pelo conteúdo (%PDF-), não pelo nome nem pelo tipo informado pelo navegador
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d)) return { ok: false, motivo: 'invalido' };
  const pdfjs = await carregarPdfjs();
  // Sem scripts (pdf.js não executa JavaScript do PDF fora do visualizador com scripting), sem eval, sem XFA, sem fontes do documento
  const tarefa = pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false });
  let tempo: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<ResultadoLeitura>((resolve) => { tempo = setTimeout(() => resolve({ ok: false, motivo: 'tempo' }), LIMITES_LEITURA.tempoMs); });
  const leitura = (async (): Promise<ResultadoLeitura> => {
    const doc = await tarefa.promise;
    const linhas: string[] = [];
    let total = 0;
    for (let p = 1; p <= Math.min(doc.numPages, LIMITES_LEITURA.paginas) && total < LIMITES_LEITURA.caracteres; p++) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      let linha = '';
      for (const item of conteudo.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof item.str !== 'string') continue;
        linha += (linha && item.str && !linha.endsWith(' ') ? ' ' : '') + item.str;
        if (item.hasEOL) { linhas.push(linha); total += linha.length; linha = ''; }
      }
      if (linha) { linhas.push(linha); total += linha.length; }
      pagina.cleanup();
    }
    const texto = normalizarTexto(linhas.join(String.fromCharCode(10))).slice(0, LIMITES_LEITURA.caracteres);
    return texto.replace(/\s/g, '').length < 20 ? { ok: false, motivo: 'sem_texto' } : { ok: true, texto };
  })().catch((e: { name?: string }) => ({ ok: false as const, motivo: e?.name === 'PasswordException' ? 'protegido' as const : 'falha' as const }));
  try {
    return await Promise.race([leitura, limite]);
  } finally {
    clearTimeout(tempo);
    tarefa.destroy().catch(() => {});
  }
}

export const MENSAGEM_LEITURA: Record<Exclude<ResultadoLeitura, { ok: true }>['motivo'], string> = {
  invalido: 'O arquivo não é um PDF válido.',
  grande: 'O PDF deve ter até 10 MB.',
  sem_texto: 'Este PDF não tem texto legível (provavelmente é digitalizado). Preencha os campos manualmente.',
  protegido: 'O PDF está protegido por senha. Preencha os campos manualmente.',
  tempo: 'A leitura do PDF demorou demais. Preencha os campos manualmente.',
  falha: 'Não foi possível ler o PDF. Preencha os campos manualmente.',
};
