// Cores escolhidas pelo usuário: sempre "#rrggbb" (o banco valida o mesmo formato).

export interface OpcaoCor {
  valor: string;
  nome: string;
}

export const ehCorHex = (valor: string) => /^#[0-9a-fA-F]{6}$/.test(valor);

export function normalizarCor(valor: string): string | null {
  const texto = valor.trim();
  const comCerquilha = texto.startsWith('#') ? texto : `#${texto}`;
  return ehCorHex(comCerquilha) ? comCerquilha.toLowerCase() : null;
}

// Cor do texto/ícone sobre um fundo colorido: escuro em cores claras, branco nas demais (contraste WCAG).
export function corSobre(fundo: string): string {
  if (!ehCorHex(fundo)) return '#ffffff';
  const canal = (i: number) => {
    const c = parseInt(fundo.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  const contrasteBranco = 1.05 / (luminancia + 0.05);
  const contrasteEscuro = (luminancia + 0.05) / 0.0687; // #111827
  return contrasteEscuro > contrasteBranco ? '#111827' : '#ffffff';
}

export const CORES_CATEGORIA: OpcaoCor[] = [
  { valor: '#16a34a', nome: 'Verde' },
  { valor: '#0d9488', nome: 'Verde-água' },
  { valor: '#3b82f6', nome: 'Azul' },
  { valor: '#8b5cf6', nome: 'Roxo' },
  { valor: '#ec4899', nome: 'Rosa' },
  { valor: '#ef4444', nome: 'Vermelho' },
  { valor: '#f59e0b', nome: 'Âmbar' },
  { valor: '#9ca3af', nome: 'Cinza' },
];
