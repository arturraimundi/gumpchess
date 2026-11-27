import type { Bill, BillKind, Cents, MonthKey } from './types.ts';

// ---------- Meses ----------

export function monthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const year = Math.floor(idx / 12);
  const mon = idx - year * 12 + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

/** Lista de meses de `from` até `to`, inclusive. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  if (from > to) return [];
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** 'YYYY-MM' -> 'YYYY-MM-01' (formato da coluna reference_month no banco). */
export function monthToDate(month: MonthKey): string {
  return `${month}-01`;
}

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-11' -> 'nov/26' */
export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]}/${String(y).slice(2)}`;
}

// ---------- Totais por mês ----------

export interface MonthTotal {
  month: MonthKey;
  totalCents: Cents;
  fixedCents: Cents;
  variableCents: Cents;
}

/** Totais por mês no intervalo (meses sem gastos aparecem com zero, para o gráfico não ter buracos). */
export function totalsByMonth(bills: Bill[], from: MonthKey, to: MonthKey): MonthTotal[] {
  const map = new Map<MonthKey, MonthTotal>(
    monthRange(from, to).map((month) => [month, { month, totalCents: 0, fixedCents: 0, variableCents: 0 }]),
  );
  for (const b of bills) {
    const row = map.get(b.month);
    if (!row) continue;
    row.totalCents += b.amountCents;
    if (b.kind === 'fixed') row.fixedCents += b.amountCents;
    else row.variableCents += b.amountCents;
  }
  return [...map.values()];
}

// ---------- Categorias e variação ----------

export interface CategoryChange {
  categoryId: string;
  categoryName: string;
  kind: BillKind;
  currentCents: Cents;
  previousCents: Cents;
  diffCents: Cents;
  /** Variação percentual em relação ao mês anterior; null se o mês anterior foi zero. */
  diffPercent: number | null;
}

/**
 * Compara cada categoria do mês com o mês anterior ("o que aumentou").
 * Ordena pelas maiores altas primeiro.
 */
export function categoryChanges(bills: Bill[], month: MonthKey): CategoryChange[] {
  const prev = addMonths(month, -1);
  const map = new Map<string, CategoryChange>();
  for (const b of bills) {
    if (b.month !== month && b.month !== prev) continue;
    let row = map.get(b.categoryId);
    if (!row) {
      row = {
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        kind: b.kind,
        currentCents: 0,
        previousCents: 0,
        diffCents: 0,
        diffPercent: null,
      };
      map.set(b.categoryId, row);
    }
    if (b.month === month) row.currentCents += b.amountCents;
    else row.previousCents += b.amountCents;
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    diffCents: r.currentCents - r.previousCents,
    diffPercent:
      r.previousCents === 0 ? null : Math.round(((r.currentCents - r.previousCents) / r.previousCents) * 1000) / 10,
  }));
  return rows.sort((a, b) => b.diffCents - a.diffCents || b.currentCents - a.currentCents);
}

// ---------- Por pessoa ----------

export interface MemberTotal {
  userId: string;
  /** Quanto da(s) conta(s) é responsabilidade dessa pessoa. */
  shareCents: Cents;
  /** Quanto ela efetivamente pagou (contas em que é a pagadora). */
  paidCents: Cents;
  /**
   * Saldo em aberto: paid - share, ajustado pelos acertos já feitos
   * (partes marcadas como `settled`). Positivo = tem a receber; negativo = deve.
   */
  balanceCents: Cents;
}

/** Quanto cada pessoa gastou (parte dela) e pagou no período. */
export function memberTotals(bills: Bill[], from: MonthKey, to: MonthKey): MemberTotal[] {
  const map = new Map<string, MemberTotal>();
  const get = (userId: string) => {
    let row = map.get(userId);
    if (!row) {
      row = { userId, shareCents: 0, paidCents: 0, balanceCents: 0 };
      map.set(userId, row);
    }
    return row;
  };
  const settledAdjust = new Map<string, Cents>();
  const adjust = (userId: string, delta: Cents) => settledAdjust.set(userId, (settledAdjust.get(userId) ?? 0) + delta);

  for (const b of bills) {
    if (b.month < from || b.month > to) continue;
    for (const s of b.shares) {
      get(s.userId).shareCents += s.amountCents;
      // Parte já acertada: quem devia repassou o valor a quem pagou a conta.
      if (s.settled && b.paidBy && s.userId !== b.paidBy) {
        adjust(s.userId, s.amountCents);
        adjust(b.paidBy, -s.amountCents);
      }
    }
    if (b.paidBy) get(b.paidBy).paidCents += b.amountCents;
  }
  return [...map.values()]
    .map((r) => ({ ...r, balanceCents: r.paidCents - r.shareCents + (settledAdjust.get(r.userId) ?? 0) }))
    .sort((a, b) => b.shareCents - a.shareCents);
}

// ---------- Acerto de contas ----------

export interface Transfer {
  from: string;
  to: string;
  amountCents: Cents;
}

/**
 * Sugere transferências para zerar os saldos ("quem paga quem"),
 * usando o algoritmo guloso maior devedor -> maior credor.
 * Só considera contas com pagador definido.
 */
export function settleUp(totals: MemberTotal[]): Transfer[] {
  const debtors = totals
    .filter((t) => t.balanceCents < 0)
    .map((t) => ({ id: t.userId, amount: -t.balanceCents }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const creditors = totals
    .filter((t) => t.balanceCents > 0)
    .map((t) => ({ id: t.userId, amount: t.balanceCents }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}

/** Conveniência: considera só as contas que já têm pagador (as demais ainda não geraram dívida entre moradores). */
export function paidBillsOnly(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.paidBy !== null);
}
