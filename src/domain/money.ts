import type { Cents } from './types.ts';

/**
 * Converte o que o usuário digitou em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 12,3", "12".
 * Retorna null se não for um valor válido.
 */
export function parseBRL(input: string): Cents | null {
  let s = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (s === '' || /[^0-9.,]/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep: ',' | '.' | null = null;
  if (lastComma > -1 && lastDot > -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma > -1) {
    decimalSep = ',';
  } else if (lastDot > -1) {
    // "1.234" é milhar; "12.5" / "12.50" é decimal.
    const decimals = s.length - lastDot - 1;
    const dots = s.split('.').length - 1;
    decimalSep = dots === 1 && decimals <= 2 ? '.' : null;
  }

  let intPart = s;
  let fracPart = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (/[.,]/.test(fracPart) || fracPart.length > 2) return null;
  if (intPart === '' && fracPart === '') return null;

  const reais = intPart === '' ? 0 : Number(intPart);
  const cents = Number((fracPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(reais)) return null;
  return reais * 100 + cents;
}

/** Formata centavos como "R$ 1.234,56" (sem depender de Intl, que varia no Hermes). */
export function formatBRL(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100).toString();
  const centavos = (abs % 100).toString().padStart(2, '0');
  const withThousands = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${withThousands},${centavos}`;
}
