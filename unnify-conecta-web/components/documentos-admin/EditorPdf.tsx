'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Eye, Highlighter, ImagePlus, MousePointer2, PenLine, Save, Trash2, Type, X } from 'lucide-react';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

// Editor de PDF no navegador com bibliotecas gratuitas: pdf.js (visualizar, selecionar texto) + pdf-lib (gravar nova versão).
// "Editar texto": clique numa palavra, edite no lugar; tamanho, negrito, itálico, cor e família (aproximada para Helvetica/
// Times/Courier) vêm do trecho original e o fundo é copiado da página. IMPORTANTE (honestidade): é SOBREPOSIÇÃO — o texto
// novo é escrito na mesma linha de base, sobre o trecho coberto; o original continua dentro do arquivo (pode ser copiado).
// O resultado é sempre salvo como NOVA versão; o original fica preservado.

type Fonte = 'Helvetica' | 'TimesRoman' | 'Courier';
interface Base { id: string; pagina: number; x: number; y: number } // coordenadas da página a 100% (1 unidade = 1 ponto PDF)
export type Elemento =
  | (Base & { tipo: 'texto'; texto: string; tamanho: number; cor: string; fonte: Fonte; negrito: boolean; italico: boolean })
  // Edição de trecho existente: (x,y,w,h) = área coberta na página; yb = linha de base na tela (escala 1); base = posição no PDF
  | (Base & { tipo: 'substituicao'; w: number; h: number; yb: number; base: { x: number; y: number; w: number }; texto: string; original: string; tamanho: number;
      cor: string; fundo: string; fonte: Fonte; negrito: boolean; italico: boolean })
  | (Base & { tipo: 'imagem'; w: number; h: number; dados: string; formato: 'png' | 'jpg' })
  | (Base & { tipo: 'destaque'; w: number; h: number; cor: string });
type Ferramenta = 'editar' | 'selecionar' | 'texto' | 'imagem' | 'destaque';
const FAMILIA: Record<Fonte, string> = { Helvetica: 'Arial, Helvetica, sans-serif', TimesRoman: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
// Distância do topo da caixa (line-height 1) até a linha de base, por família — alinha o texto da tela com o do PDF
const BASE_CSS: Record<Fonte, number> = { Helvetica: 0.85, TimesRoman: 0.84, Courier: 0.77 };
const ESTILO_CAMADA = `.camada-texto{position:absolute;inset:0;overflow:clip;line-height:1;transform-origin:0 0;z-index:1}
.camada-texto :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.camada-texto{--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size))}
.camada-texto > :not(.markedContent),.camada-texto .markedContent span:not(.markedContent){--font-height:0;font-size:calc(var(--text-scale-factor)*var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.camada-texto .markedContent{display:contents}.camada-texto ::selection{background:rgba(234,88,12,.3)}
.camada-texto.editar span{cursor:text}.camada-texto.editar span:hover{outline:1px dashed #ea580c;background:rgba(234,88,12,.06)}
[data-editavel]:focus{outline:2px solid #ea580c;outline-offset:1px}`;

/* eslint-disable @typescript-eslint/no-explicit-any -- tipos do pdf.js carregado sob demanda */
async function carregarPdfjs(): Promise<any> {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker-6.3.289.min.mjs';
  return pdfjs;
}
const hexParaRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const novoId = () => Math.random().toString(36).slice(2, 10);
const paraHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Lê a página renderizada: cor do texto = pixel mais escuro do trecho; fundo = cor mais comum na borda em volta
function amostrarCores(canvas: HTMLCanvasElement, caixa: { x: number; y: number; w: number; h: number }, zoom: number): { cor: string; fundo: string } {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const k = (canvas.width / (parseFloat(canvas.style.width) || canvas.width)) * zoom;
    const x = Math.max(0, Math.floor(caixa.x * k) - 2), y = Math.max(0, Math.floor(caixa.y * k) - 2);
    const w = Math.min(canvas.width - x, Math.ceil(caixa.w * k) + 4), h = Math.min(canvas.height - y, Math.ceil(caixa.h * k) + 4);
    const px = ctx.getImageData(x, y, w, h).data;
    let escuro = [17, 24, 39], lumMin = 999;
    const borda = new Map<string, number>();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4; const [r, g, b] = [px[o], px[o + 1], px[o + 2]];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < lumMin) { lumMin = lum; escuro = [r, g, b]; }
      if (i < 2 || j < 2 || i >= w - 2 || j >= h - 2) { const ch = paraHex(r & 0xf8, g & 0xf8, b & 0xf8); borda.set(ch, (borda.get(ch) ?? 0) + 1); }
    }
    const fundo = [...borda.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff';
    return { cor: paraHex(escuro[0], escuro[1], escuro[2]), fundo: fundo === '#f8f8f8' ? '#ffffff' : fundo };
  } catch { return { cor: '#111827', fundo: '#ffffff' }; }
}

// Texto editável no próprio lugar (como num editor de texto). Conteúdo controlado pelo navegador enquanto em foco.
function TextoEditavel({ valor, foco, caret, estilo, rotulo, aoMudar, aoFocar, aoSair }: {
  valor: string; foco: boolean; caret: number | null; estilo: React.CSSProperties; rotulo: string;
  aoMudar: (v: string) => void; aoFocar: () => void; aoSair: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.textContent !== valor) ref.current.textContent = valor; }, [valor]);
  useEffect(() => {
    const el = ref.current; if (!foco || !el) return;
    el.focus();
    const no = el.firstChild ?? el; const tam = no.textContent?.length ?? 0;
    const rg = document.createRange(); rg.setStart(no, Math.min(caret ?? tam, tam)); rg.collapse(true);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(rg);
  }, [foco, caret]);
  return (
    <span ref={ref} role="textbox" aria-label={rotulo} data-editavel contentEditable suppressContentEditableWarning spellCheck={false}
      onInput={(e) => aoMudar((e.currentTarget.textContent ?? '').replace(/\n/g, ' '))} onFocus={aoFocar} onBlur={aoSair}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
      onPointerDown={(e) => e.stopPropagation()} style={{ ...estilo, whiteSpace: 'pre', cursor: 'text', minWidth: 4, display: 'inline-block' }} />
  );
}

// Gera o PDF com as alterações (pdf-lib). Lança erro com mensagem amigável quando não for possível.
export async function gerarPdfEditado(original: ArrayBuffer, elementos: Elemento[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  let pdf;
  try { pdf = await PDFDocument.load(original); } catch { throw new Error('Este PDF está protegido por senha/criptografia e não pode ser editado aqui.'); }
  const pdfjs = await carregarPdfjs();
  const tarefaLeitura = pdfjs.getDocument({ data: new Uint8Array(original.slice(0)) });
  const leitor = await tarefaLeitura.promise;
  const fontes = new Map<string, any>();
  const fonte = async (f: Fonte, negrito: boolean, italico: boolean) => {
    const V = { Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], TimesRoman: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
      Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] } as const;
    const nome = StandardFonts[V[f][(negrito ? 1 : 0) + (italico ? 2 : 0)]];
    if (!fontes.has(nome)) fontes.set(nome, await pdf.embedFont(nome));
    return fontes.get(nome);
  };
  for (const el of elementos) {
    const pagina = pdf.getPage(el.pagina - 1);
    const vp = (await leitor.getPage(el.pagina)).getViewport({ scale: 1 });
    const ponto = (x: number, y: number) => vp.convertToPdfPoint(x, y) as [number, number];
    if (el.tipo === 'destaque') {
      const [x, y] = ponto(el.x, el.y + el.h);
      pagina.drawRectangle({ x, y, width: el.w, height: el.h, color: rgb(...hexParaRgb(el.cor)), opacity: 0.35 });
    }
    if (el.tipo === 'substituicao') {
      // Cobre o trecho original com a cor do fundo e escreve o novo texto exatamente na linha de base original
      const b = el.base;
      pagina.drawRectangle({ x: b.x - 0.5, y: b.y - el.tamanho * 0.26, width: b.w + 1, height: el.tamanho * 1.22, color: rgb(...hexParaRgb(el.fundo)) });
      if (el.texto) {
        const f = await fonte(el.fonte, el.negrito, el.italico);
        try { pagina.drawText(el.texto, { x: b.x, y: b.y, size: el.tamanho, font: f, color: rgb(...hexParaRgb(el.cor)) }); }
        catch { throw new Error(`O texto "${el.texto.slice(0, 30)}" tem caracteres que a fonte padrão do PDF não suporta (ex.: emojis).`); }
      }
      continue;
    }
    if (el.tipo === 'texto') {
      const f = await fonte(el.fonte, el.negrito, el.italico);
      const linhas = el.texto.split('\n');
      for (let i = 0; i < linhas.length; i++) {
        const [x, y] = ponto(el.x, el.y + el.tamanho * BASE_CSS[el.fonte] + i * el.tamanho * 1.2);
        try { pagina.drawText(linhas[i], { x, y, size: el.tamanho, font: f, color: rgb(...hexParaRgb(el.cor)) }); }
        catch { throw new Error(`O texto "${linhas[i].slice(0, 30)}" tem caracteres que a fonte padrão do PDF não suporta (ex.: emojis).`); }
      }
    }
    if (el.tipo === 'imagem') {
      const bytes = Uint8Array.from(atob(el.dados.split(',')[1]), (c) => c.charCodeAt(0));
      const img = el.formato === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const [x, y] = ponto(el.x, el.y + el.h);
      pagina.drawImage(img, { x, y, width: el.w, height: el.h });
    }
  }
  await tarefaLeitura.destroy();
  return pdf.save();
}

export function EditorPdf({ nome, versao, bytes, assinado, aoFechar, aoSalvar }: {
  nome: string; versao: number; bytes: ArrayBuffer; assinado: boolean; aoFechar: () => void;
  aoSalvar: (pdf: Uint8Array, observacao: string, confirmarAssinado: boolean) => Promise<string | null>;
}) {
  const [doc, setDoc] = useState<any>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(1.25);
  const [tamPagina, setTamPagina] = useState<{ w: number; h: number; rotacao: number } | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('editar');
  const [editando, setEditando] = useState<{ id: string; caret: number | null } | null>(null);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [estilo, setEstilo] = useState({ tamanho: 12, cor: '#111827', fonte: 'Helvetica' as Fonte, negrito: false, italico: false, corDestaque: '#facc15' });
  const [miniaturas, setMiniaturas] = useState<string[]>([]);
  const [observacao, setObservacao] = useState('');
  const [confirmaAss, setConfirmaAss] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textoRef = useRef<HTMLDivElement>(null);
  const paginaRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ id?: string; dx: number; dy: number; inicio?: { x: number; y: number } } | null>(null);
  const [rascunhoRet, setRascunhoRet] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const arquivoImg = useRef<HTMLInputElement>(null);
  const posImagem = useRef<{ x: number; y: number } | null>(null);
  const render = useRef<{ pagina: any; vp1: any; camada: any; itens: any[]; estilos: Record<string, any> } | null>(null);

  useEffect(() => {
    let ativo = true; let tarefa: any = null;
    carregarPdfjs().then((pdfjs) => { tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }); return tarefa.promise; })
      .then(async (d: any) => {
        if (!ativo) return;
        setDoc(d); setPaginas(d.numPages);
        const imgs: string[] = [];
        for (let i = 1; i <= Math.min(d.numPages, 50); i++) {
          const p = await d.getPage(i); const vp = p.getViewport({ scale: 0.18 });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await p.render({ canvas: c, viewport: vp }).promise; imgs.push(c.toDataURL('image/png'));
          if (!ativo) return;
          setMiniaturas([...imgs]);
        }
      })
      .catch((e: any) => ativo && setErroCarga(e?.name === 'PasswordException' ? 'Este PDF é protegido por senha e não pode ser aberto aqui.' : 'Não foi possível abrir este PDF (arquivo danificado ou formato não suportado).'));
    return () => { ativo = false; tarefa?.destroy(); };
  }, [bytes]);

  // Renderiza a página atual (canvas + camada de texto selecionável)
  useEffect(() => {
    if (!doc) return;
    let tarefa: any; let camada: any; let cancelado = false;
    (async () => {
      const pdfjs = await carregarPdfjs();
      const p = await doc.getPage(pagina);
      const vp1 = p.getViewport({ scale: 1 });
      setTamPagina({ w: vp1.width, h: vp1.height, rotacao: p.rotate ?? 0 });
      const vp = p.getViewport({ scale: zoom });
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current; if (!canvas || cancelado) return;
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
      tarefa = p.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await tarefa.promise.catch(() => {});
      const cont = textoRef.current; if (!cont || cancelado) return;
      cont.innerHTML = ''; cont.style.setProperty('--total-scale-factor', String(zoom));
      const conteudo = await p.getTextContent();
      camada = new pdfjs.TextLayer({ textContentSource: conteudo, container: cont, viewport: vp });
      await camada.render().catch(() => {});
      // Cada <span> da camada corresponde, na ordem, a um item com texto (str definido) do conteúdo da página
      if (!cancelado) render.current = { pagina: p, vp1, camada, itens: conteudo.items.filter((i: any) => i.str !== undefined), estilos: conteudo.styles };
    })();
    return () => { cancelado = true; tarefa?.cancel?.(); camada?.cancel?.(); };
  }, [doc, pagina, zoom]);

  const daPagina = (e: { clientX: number; clientY: number }) => {
    const r = paginaRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const rotacionada = !!tamPagina && tamPagina.rotacao % 360 !== 0;
  const atualizar = (id: string, mud: Partial<Elemento>) => setElementos((xs) => xs.map((x) => (x.id === id ? ({ ...x, ...mud } as Elemento) : x)));
  const selecionado = elementos.find((e) => e.id === sel) ?? null;

  const aoPressionar = (e: React.PointerEvent) => {
    if (rotacionada || ferramenta === 'selecionar' || ferramenta === 'editar') return;
    const p = daPagina(e);
    if (ferramenta === 'texto') {
      e.preventDefault(); // evita que o clique tire o foco da caixa recém-criada
      const id = novoId();
      setElementos((xs) => [...xs, { id, tipo: 'texto', pagina, x: p.x, y: p.y, texto: '', tamanho: estilo.tamanho, cor: estilo.cor, fonte: estilo.fonte, negrito: estilo.negrito, italico: estilo.italico }]);
      setSel(id); setEditando({ id, caret: 0 }); setFerramenta('editar');
    } else if (ferramenta === 'imagem') {
      posImagem.current = p; arquivoImg.current?.click();
    } else if (ferramenta === 'destaque') {
      arrasto.current = { dx: 0, dy: 0, inicio: p }; setRascunhoRet({ x: p.x, y: p.y, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };
  const aoMover = (e: React.PointerEvent) => {
    const a = arrasto.current; if (!a) return;
    const p = daPagina(e);
    if (a.inicio) setRascunhoRet({ x: Math.min(a.inicio.x, p.x), y: Math.min(a.inicio.y, p.y), w: Math.abs(p.x - a.inicio.x), h: Math.abs(p.y - a.inicio.y) });
    else if (a.id && tamPagina) atualizar(a.id, { x: Math.max(0, Math.min(tamPagina.w - 5, p.x - a.dx)), y: Math.max(0, Math.min(tamPagina.h - 5, p.y - a.dy)) });
  };
  const aoSoltar = () => {
    const a = arrasto.current; arrasto.current = null;
    if (a?.inicio && rascunhoRet && rascunhoRet.w > 3 && rascunhoRet.h > 3) {
      const id = novoId();
      setElementos((xs) => [...xs, { id, tipo: 'destaque', pagina, ...rascunhoRet, cor: estilo.corDestaque }]); setSel(id);
    }
    setRascunhoRet(null);
  };
  // "Editar texto": clique numa palavra existente → caixa editável no mesmo lugar, com o estilo do trecho
  const aoClicarTexto = (e: React.MouseEvent) => {
    if (ferramenta !== 'editar' || rotacionada || !render.current) return;
    const alvo = e.target as HTMLElement;
    if (alvo.tagName !== 'SPAN' || !alvo.textContent?.trim()) return;
    const { pagina: pg, vp1, camada, itens, estilos } = render.current;
    const item = itens[camada.textDivs.indexOf(alvo)];
    if (!item) return;
    // Posição do cursor dentro do trecho, onde a pessoa clicou
    let caret: number | null = null;
    const d0: any = document;
    if (d0.caretRangeFromPoint) { const rg = d0.caretRangeFromPoint(e.clientX, e.clientY); if (rg && alvo.contains(rg.startContainer)) caret = rg.startOffset; }
    else if (d0.caretPositionFromPoint) { const cp = d0.caretPositionFromPoint(e.clientX, e.clientY); if (cp && alvo.contains(cp.offsetNode)) caret = cp.offset; }
    const [a, b, c, d, ex, ey] = item.transform as number[];
    const tamanho = Math.round((Math.hypot(c, d) || Math.hypot(a, b)) * 100) / 100;
    let infoFonte: any = null;
    try { infoFonte = pg.commonObjs.get(item.fontName); } catch { /* fonte ainda não carregada */ }
    const nomeFonte = `${infoFonte?.name ?? ''} ${infoFonte?.fallbackName ?? ''}`;
    const negrito = !!(infoFonte?.bold || infoFonte?.black) || /bold|black|heavy|semibold|demi/i.test(nomeFonte);
    const italico = !!infoFonte?.italic || /italic|oblique/i.test(nomeFonte);
    const familia = estilos[item.fontName]?.fontFamily;
    const fonte: Fonte = /courier|mono/i.test(nomeFonte) || familia === 'monospace' ? 'Courier'
      : /times|roman|georgia|garamond|minion|cambria|book/i.test(nomeFonte) || familia === 'serif' ? 'TimesRoman' : 'Helvetica';
    const largura = item.width || alvo.getBoundingClientRect().width / zoom;
    const [x1, y1] = vp1.convertToViewportPoint(ex, ey - tamanho * 0.26);
    const [x2, y2] = vp1.convertToViewportPoint(ex + largura, ey + tamanho * 0.96);
    const [, yb] = vp1.convertToViewportPoint(ex, ey);
    const caixa = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    const { cor, fundo } = amostrarCores(canvasRef.current!, caixa, zoom);
    const id = novoId();
    setElementos((xs) => [...xs, { id, tipo: 'substituicao', pagina, ...caixa, yb, base: { x: ex, y: ey, w: largura }, texto: alvo.textContent!, original: alvo.textContent!,
      tamanho, cor, fundo, fonte, negrito, italico }]);
    setSel(id); setEditando({ id, caret });
  };
  const aoEscolherImagem = async (f: File | undefined) => {
    if (!f || !posImagem.current) return;
    if (!['image/png', 'image/jpeg'].includes(f.type) || f.size > 5 * 1024 * 1024) return setMsg({ tipo: 'erro', texto: 'Imagem: PNG ou JPG até 5 MB.' });
    const dados = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(f); });
    const dim = await new Promise<{ w: number; h: number }>((ok) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.src = dados; });
    const escala = Math.min(1, 160 / Math.max(dim.w, dim.h));
    const id = novoId();
    setElementos((xs) => [...xs, { id, tipo: 'imagem', pagina, x: posImagem.current!.x, y: posImagem.current!.y, w: dim.w * escala, h: dim.h * escala, dados, formato: f.type === 'image/png' ? 'png' : 'jpg' }]);
    setSel(id); setFerramenta('editar'); if (arquivoImg.current) arquivoImg.current.value = '';
  };

  const gerar = useCallback(async () => { setMsg(null); return gerarPdfEditado(bytes, elementos); }, [bytes, elementos]);
  const abrirBlob = (pdf: Uint8Array, janela: Window | null) => {
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    if (janela) janela.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `${nome}-editado.pdf`; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const executar = async (acao: 'previa' | 'exportar' | 'salvar') => {
    if (elementos.length === 0) return setMsg({ tipo: 'erro', texto: 'Nenhuma alteração para aplicar.' });
    if (acao === 'salvar' && assinado && !confirmaAss) return setMsg({ tipo: 'erro', texto: 'Confirme que a nova versão invalida a assinatura digital do original.' });
    const janela = acao === 'previa' ? window.open('', '_blank') : null; // aberta no clique (evita bloqueio de pop-up)
    if (acao === 'previa' && !janela) return setMsg({ tipo: 'erro', texto: 'Permita pop-ups para pré-visualizar.' });
    setProcessando(true);
    try {
      const pdf = await gerar();
      if (acao !== 'salvar') abrirBlob(pdf, janela);
      else {
        const erro = await aoSalvar(pdf, observacao, confirmaAss);
        if (erro) setMsg({ tipo: 'erro', texto: erro });
      }
    } catch (e) { janela?.close(); setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível gerar o PDF.' }); }
    setProcessando(false);
  };

  const botaoFerr = (f: Ferramenta, rot: string, Icone: typeof Type) => (
    <button type="button" aria-pressed={ferramenta === f} onClick={() => setFerramenta(f)} disabled={rotacionada && f !== 'selecionar'}
      className={`min-h-11 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 ${ferramenta === f ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'}`}>
      <Icone className="w-4 h-4" aria-hidden="true" />{rot}</button>
  );
  const naPagina = elementos.filter((e) => e.pagina === pagina);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Editor de PDF — ${nome}`} className="fixed inset-0 z-[70] bg-gray-100 flex flex-col">
      <style>{ESTILO_CAMADA}</style>
      <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1"><p className="font-bold text-gray-900 truncate">{nome}</p><p className="text-xs text-gray-500">Editando a partir da v{versao} · salva como v{versao + 1}</p></div>
        <button type="button" className={classeBotaoSecundario} disabled={processando} onClick={() => executar('previa')}><Eye className="w-4 h-4" aria-hidden="true" />Pré-visualizar</button>
        <button type="button" className={classeBotaoSecundario} disabled={processando} onClick={() => executar('exportar')}><Download className="w-4 h-4" aria-hidden="true" />Exportar</button>
        <button type="button" className={classeBotaoPrimario} disabled={processando} onClick={() => executar('salvar')}><Save className="w-4 h-4" aria-hidden="true" />{processando ? 'Processando...' : 'Salvar como nova versão'}</button>
        <button type="button" onClick={aoFechar} aria-label="Fechar editor" className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X className="w-5 h-5" aria-hidden="true" /></button>
      </header>
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex flex-wrap items-center gap-1" role="toolbar" aria-label="Ferramentas">
        {botaoFerr('editar', 'Editar texto', PenLine)}
        {botaoFerr('selecionar', 'Selecionar / mover', MousePointer2)}
        {botaoFerr('texto', 'Novo texto', Type)}
        {botaoFerr('imagem', 'Imagem', ImagePlus)}
        {botaoFerr('destaque', 'Destaque', Highlighter)}
        <span className="w-px h-8 bg-gray-200 mx-1" aria-hidden="true" />
        <label className="text-xs text-gray-600 inline-flex items-center gap-1">Fonte
          <select value={selecionado && 'fonte' in selecionado ? selecionado.fonte : estilo.fonte} onChange={(e) => { const f = e.target.value as Fonte; setEstilo((s) => ({ ...s, fonte: f })); if (selecionado && 'fonte' in selecionado) atualizar(selecionado.id, { fonte: f }); }} className="h-9 border border-gray-300 rounded-md text-sm px-1">
            <option value="Helvetica">Helvetica</option><option value="TimesRoman">Times</option><option value="Courier">Courier</option></select></label>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1">Tamanho
          <input type="number" min={4} max={96} step={0.5} value={selecionado && 'tamanho' in selecionado ? selecionado.tamanho : estilo.tamanho} onChange={(e) => { const t = Math.max(4, Math.min(96, Number(e.target.value) || 12)); setEstilo((s) => ({ ...s, tamanho: t })); if (selecionado && 'tamanho' in selecionado) atualizar(selecionado.id, { tamanho: t }); }} className="h-9 w-16 border border-gray-300 rounded-md text-sm px-1" /></label>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1">Cor
          <input type="color" aria-label="Cor do texto" value={selecionado && 'cor' in selecionado && selecionado.tipo !== 'destaque' ? selecionado.cor : estilo.cor} onChange={(e) => { setEstilo((s) => ({ ...s, cor: e.target.value })); if (selecionado && (selecionado.tipo === 'texto' || selecionado.tipo === 'substituicao')) atualizar(selecionado.id, { cor: e.target.value }); }} className="h-9 w-10" /></label>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1"><input type="checkbox" checked={selecionado && 'negrito' in selecionado ? selecionado.negrito : estilo.negrito} onChange={(e) => { setEstilo((s) => ({ ...s, negrito: e.target.checked })); if (selecionado && 'negrito' in selecionado) atualizar(selecionado.id, { negrito: e.target.checked }); }} /><strong>Negrito</strong></label>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1"><input type="checkbox" checked={selecionado && 'italico' in selecionado ? selecionado.italico : estilo.italico} onChange={(e) => { setEstilo((s) => ({ ...s, italico: e.target.checked })); if (selecionado && 'italico' in selecionado) atualizar(selecionado.id, { italico: e.target.checked }); }} /><em>Itálico</em></label>
        <span className="w-px h-8 bg-gray-200 mx-1" aria-hidden="true" />
        <select aria-label="Zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-9 border border-gray-300 rounded-md text-sm px-1">{[0.75, 1, 1.25, 1.5, 2].map((z) => <option key={z} value={z}>{z * 100}%</option>)}</select>
        <input ref={arquivoImg} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => aoEscolherImagem(e.target.files?.[0])} aria-label="Imagem a inserir" />
      </div>
      <p className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-3 py-2 flex gap-2" data-testid="aviso-sobreposicao"><AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        Clique numa palavra para editar no lugar (Enter conclui). Tamanho, negrito, itálico e cor seguem o trecho original; a fonte é a padrão mais parecida (Helvetica, Times ou Courier). É uma <strong>sobreposição</strong>: o texto novo cobre o antigo, que continua dentro do arquivo, e não empurra o resto da linha. O original fica preservado na v{versao}.</p>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm px-3 py-2 ${msg.tipo === 'erro' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{msg.texto}</p>}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[9rem_minmax(0,1fr)_17rem]">
        <nav aria-label="Páginas" className="hidden lg:block overflow-y-auto border-r border-gray-200 bg-white p-2 space-y-2">
          {Array.from({ length: paginas }, (_, i) => (
            <button key={i} type="button" onClick={() => setPagina(i + 1)} aria-label={`Página ${i + 1}`} aria-current={pagina === i + 1 ? 'page' : undefined}
              className={`w-full rounded-lg border-2 p-1 ${pagina === i + 1 ? 'border-orange-500' : 'border-transparent hover:border-gray-200'}`}>
              {miniaturas[i] ? <img src={miniaturas[i]} alt="" className="w-full" /> : <span className="block h-24 bg-gray-100 rounded" />}
              <span className="text-xs text-gray-600">{i + 1}{elementos.some((e) => e.pagina === i + 1) ? ' •' : ''}</span>
            </button>
          ))}
        </nav>
        <div className="overflow-auto p-3 sm:p-6" onPointerMove={aoMover} onPointerUp={aoSoltar}>
          {erroCarga ? <p role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erroCarga}</p> : !doc ? <div role="status" aria-label="Abrindo PDF" className="mx-auto h-96 max-w-xl rounded-xl bg-white animate-pulse" /> : (
            <>
              {rotacionada && <p role="status" className="mb-2 text-sm text-amber-800">Página girada: as ferramentas de edição ficam desativadas nesta página.</p>}
              <div ref={paginaRef} className="relative mx-auto bg-white shadow-md select-text" style={{ width: (tamPagina?.w ?? 0) * zoom, height: (tamPagina?.h ?? 0) * zoom, cursor: ferramenta === 'texto' || ferramenta === 'imagem' ? 'copy' : ferramenta === 'destaque' ? 'crosshair' : undefined }}
                onPointerDown={aoPressionar} data-testid="pagina-pdf">
                <canvas ref={canvasRef} className="absolute inset-0" />
                <div ref={textoRef} className={`camada-texto ${ferramenta === 'editar' ? 'editar' : ''}`} style={{ pointerEvents: ferramenta === 'selecionar' || ferramenta === 'editar' ? 'auto' : 'none' }} onClick={aoClicarTexto} />
                <div className="absolute inset-0 z-[2]" style={{ pointerEvents: 'none' }}>
                  {naPagina.map((el) => {
                    const ativo = sel === el.id;
                    const mover = (e: React.PointerEvent) => { if (ferramenta !== 'selecionar') return; e.stopPropagation(); setSel(el.id); const p = daPagina(e); arrasto.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y }; };
                    if (el.tipo === 'substituicao' || el.tipo === 'texto') {
                      const fonteCss = { fontSize: el.tamanho * zoom, lineHeight: 1, color: el.cor, fontFamily: FAMILIA[el.fonte], fontWeight: el.negrito ? 700 : 400, fontStyle: el.italico ? 'italic' : 'normal' };
                      // Linha de base da tela = linha de base do PDF: topo = base − (fração de ascendência × tamanho)
                      const topo = el.tipo === 'substituicao' ? el.yb - el.tamanho * BASE_CSS[el.fonte] : el.y;
                      return (
                        <div key={el.id} data-testid={`elemento-${el.tipo}`}>
                          {el.tipo === 'substituicao' && <div className="absolute" style={{ left: el.x * zoom, top: el.y * zoom, width: el.w * zoom, height: el.h * zoom, background: el.fundo }} />}
                          <div className={`absolute ${ativo && ferramenta === 'selecionar' ? 'outline outline-2 outline-orange-500' : ''}`} onPointerDown={mover}
                            style={{ pointerEvents: 'auto', left: el.x * zoom, top: topo * zoom, cursor: ferramenta === 'selecionar' ? 'move' : 'text' }}>
                            <TextoEditavel valor={el.texto} foco={editando?.id === el.id} caret={editando?.id === el.id ? editando.caret : null} estilo={fonteCss}
                              rotulo={el.tipo === 'substituicao' ? `Editar trecho: ${el.original}` : 'Novo texto'}
                              aoMudar={(v) => atualizar(el.id, { texto: v })} aoFocar={() => setSel(el.id)}
                              aoSair={() => { setEditando(null); setElementos((xs) => xs.filter((x) => !(x.id === el.id && x.tipo === 'texto' && !x.texto.trim()))); }} />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={el.id} data-testid={`elemento-${el.tipo}`} onPointerDown={mover}
                        className={`absolute ${ativo ? 'outline outline-2 outline-orange-500' : 'hover:outline hover:outline-1 hover:outline-orange-300'}`}
                        style={{ pointerEvents: 'auto', cursor: 'move', left: el.x * zoom, top: el.y * zoom, width: el.w * zoom, height: el.h * zoom,
                          ...(el.tipo === 'destaque' ? { background: el.cor, opacity: 0.35 } : {}) }}>
                        {el.tipo === 'imagem' && <img src={el.dados} alt="" className="w-full h-full pointer-events-none" />}
                      </div>
                    );
                  })}
                  {rascunhoRet && <div className="absolute border-2 border-dashed border-orange-500" style={{ left: rascunhoRet.x * zoom, top: rascunhoRet.y * zoom, width: rascunhoRet.w * zoom, height: rascunhoRet.h * zoom }} />}
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="w-11 h-11 rounded-lg bg-white border border-gray-200 inline-flex items-center justify-center disabled:opacity-40"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
                <span className="text-sm text-gray-700" data-testid="indicador-pagina">Página {pagina} de {paginas}</span>
                <button type="button" aria-label="Próxima página" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)} className="w-11 h-11 rounded-lg bg-white border border-gray-200 inline-flex items-center justify-center disabled:opacity-40"><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
              </div>
            </>
          )}
        </div>
        <aside aria-label="Alterações" className="border-t lg:border-t-0 lg:border-l border-gray-200 bg-white p-3 overflow-y-auto space-y-3">
          {selecionado && selecionado.tipo === 'substituicao' && (
            <div className="rounded-lg border border-gray-200 p-2 text-xs space-y-1" data-testid="estilo-detectado">
              <p className="font-semibold text-gray-900 text-sm">Trecho em edição</p>
              <p className="text-gray-600">Original: “{selecionado.original}”</p>
              <p className="text-gray-600">Detectado: {selecionado.tamanho} pt · {selecionado.negrito ? 'negrito' : 'normal'}{selecionado.italico ? ' · itálico' : ''} · {{ Helvetica: 'Helvetica', TimesRoman: 'Times', Courier: 'Courier' }[selecionado.fonte]}
                <span className="inline-block w-3 h-3 rounded-sm align-middle ml-1 border border-gray-300" style={{ background: selecionado.cor }} title="Cor do texto" />
                <span className="inline-block w-3 h-3 rounded-sm align-middle ml-1 border border-gray-300" style={{ background: selecionado.fundo }} title="Cor do fundo" /></p>
              <p className="text-gray-500">Apague todo o texto para remover o trecho. Para desfazer, remova a alteração na lista.</p>
            </div>
          )}
          {selecionado && (selecionado.tipo === 'imagem' || selecionado.tipo === 'destaque') && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label>Largura<input type="number" min={2} value={Math.round(selecionado.w)} onChange={(e) => atualizar(selecionado.id, { w: Math.max(2, Number(e.target.value) || 2) })} className="w-full h-9 border border-gray-300 rounded-md px-1" /></label>
              <label>Altura<input type="number" min={2} value={Math.round(selecionado.h)} onChange={(e) => atualizar(selecionado.id, { h: Math.max(2, Number(e.target.value) || 2) })} className="w-full h-9 border border-gray-300 rounded-md px-1" /></label>
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-1">Alterações ({elementos.length})</h2>
            {elementos.length === 0 ? <p className="text-xs text-gray-500">Clique em qualquer palavra da página para editar. Em &quot;Selecionar / mover&quot;, dá para copiar o texto do PDF e arrastar os itens adicionados.</p> : (
              <ul className="space-y-1 text-sm" data-testid="lista-alteracoes">
                {elementos.map((el) => (
                  <li key={el.id} className={`flex items-center gap-2 rounded-lg px-2 ${sel === el.id ? 'bg-orange-50' : ''}`}>
                    <button type="button" onClick={() => { setPagina(el.pagina); setSel(el.id); }} className="flex-1 min-w-0 text-left min-h-9 truncate">
                      p.{el.pagina} · {el.tipo === 'substituicao' ? (el.texto ? `“${el.original}” → “${el.texto}”` : `Removido: “${el.original}”`) : el.tipo === 'texto' ? `Novo texto: ${el.texto}` : el.tipo === 'imagem' ? 'Imagem' : 'Destaque'}</button>
                    <button type="button" aria-label="Remover alteração" onClick={() => { setElementos((xs) => xs.filter((x) => x.id !== el.id)); if (sel === el.id) setSel(null); }} className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div><label htmlFor="editor-obs" className="block text-sm font-semibold text-gray-900 mb-1">Descrição da versão (opcional)</label>
            <input id="editor-obs" maxLength={300} value={observacao} onChange={(e) => setObservacao(e.target.value)} className="w-full h-11 border border-gray-300 rounded-lg px-2 text-sm" placeholder="Ex.: correção do valor" /></div>
          {assinado && (
            <label className="flex items-start gap-2 text-sm rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
              <input type="checkbox" checked={confirmaAss} onChange={(e) => setConfirmaAss(e.target.checked)} className="mt-1" />
              <span>Este PDF tem <strong>assinatura digital</strong> (ou foi marcado como protegido/fiscal). A nova versão <strong>invalida a assinatura</strong>. O original assinado continua preservado. Confirmo.</span>
            </label>
          )}
        </aside>
      </div>
    </div>
  );
}
