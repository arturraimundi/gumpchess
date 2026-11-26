import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bill } from './types.ts';
import {
  addMonths,
  categoryChanges,
  memberTotals,
  monthKey,
  monthLabel,
  monthRange,
  paidBillsOnly,
  settleUp,
  totalsByMonth,
} from './reports.ts';
import { computeShares, defaultSplitRule } from './split.ts';

let seq = 0;
function bill(
  month: string,
  category: [string, string, 'fixed' | 'variable'],
  amountCents: number,
  paidBy: string | null,
  members = ['ana', 'bia', 'caio'],
): Bill {
  return {
    id: `b${++seq}`,
    month,
    categoryId: category[0],
    categoryName: category[1],
    kind: category[2],
    description: null,
    amountCents,
    paidBy,
    shares: computeShares(amountCents, defaultSplitRule(members)),
  };
}

const ALUGUEL: [string, string, 'fixed'] = ['c1', 'Aluguel', 'fixed'];
const LUZ: [string, string, 'variable'] = ['c2', 'Luz', 'variable'];
const MERCADO: [string, string, 'variable'] = ['c3', 'Mercado', 'variable'];

test('utilitários de mês', () => {
  assert.equal(monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-05', -17), '2024-12');
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthRange('2026-03', '2026-01'), []);
  assert.equal(monthLabel('2026-11'), 'nov/26');
});

test('totais por mês preenchem meses vazios e separam fixas de variáveis', () => {
  const bills = [
    bill('2026-09', ALUGUEL, 300000, 'ana'),
    bill('2026-09', LUZ, 18000, 'bia'),
    bill('2026-11', ALUGUEL, 300000, 'ana'),
    bill('2026-11', LUZ, 24000, 'caio'),
    bill('2026-12', LUZ, 1, 'caio'), // fora do intervalo
  ];
  assert.deepEqual(totalsByMonth(bills, '2026-09', '2026-11'), [
    { month: '2026-09', totalCents: 318000, fixedCents: 300000, variableCents: 18000 },
    { month: '2026-10', totalCents: 0, fixedCents: 0, variableCents: 0 },
    { month: '2026-11', totalCents: 324000, fixedCents: 300000, variableCents: 24000 },
  ]);
});

test('variação por categoria mostra o que aumentou em relação ao mês anterior', () => {
  const bills = [
    bill('2026-10', ALUGUEL, 300000, 'ana'),
    bill('2026-10', LUZ, 20000, 'bia'),
    bill('2026-11', ALUGUEL, 300000, 'ana'),
    bill('2026-11', LUZ, 25000, 'bia'),
    bill('2026-11', MERCADO, 40000, 'caio'),
    bill('2026-11', MERCADO, 10000, 'ana'),
  ];
  const rows = categoryChanges(bills, '2026-11');
  assert.deepEqual(
    rows.map((r) => [r.categoryName, r.currentCents, r.previousCents, r.diffCents, r.diffPercent]),
    [
      ['Mercado', 50000, 0, 50000, null],
      ['Luz', 25000, 20000, 5000, 25],
      ['Aluguel', 300000, 300000, 0, 0],
    ],
  );
});

test('quanto cada um gastou e pagou no período', () => {
  const bills = [
    bill('2026-10', ALUGUEL, 300000, 'ana'),
    bill('2026-11', LUZ, 30000, 'bia'),
    bill('2026-11', MERCADO, 9000, 'caio', ['bia', 'caio']), // ana não participou
    bill('2026-08', LUZ, 99999, 'ana'), // fora do período
  ];
  const totals = memberTotals(bills, '2026-10', '2026-11');
  const byUser = Object.fromEntries(totals.map((t) => [t.userId, t]));
  assert.deepEqual(byUser.ana, { userId: 'ana', shareCents: 110000, paidCents: 300000, balanceCents: 190000 });
  assert.deepEqual(byUser.bia, { userId: 'bia', shareCents: 114500, paidCents: 30000, balanceCents: -84500 });
  assert.deepEqual(byUser.caio, { userId: 'caio', shareCents: 114500, paidCents: 9000, balanceCents: -105500 });
  // Saldos sempre somam zero quando todas as contas têm pagador.
  assert.equal(
    totals.reduce((a, t) => a + t.balanceCents, 0),
    0,
  );
});

test('partes já acertadas saem do saldo em aberto', () => {
  const b = bill('2026-11', LUZ, 30000, 'ana');
  b.shares = b.shares.map((s) => (s.userId === 'bia' ? { ...s, settled: true } : s));
  const totals = memberTotals([b], '2026-11', '2026-11');
  const byUser = Object.fromEntries(totals.map((t) => [t.userId, t.balanceCents]));
  assert.deepEqual(byUser, { ana: 10000, bia: 0, caio: -10000 });
  assert.deepEqual(settleUp(totals), [{ from: 'caio', to: 'ana', amountCents: 10000 }]);
});

test('acerto de contas zera todos os saldos', () => {
  const bills = paidBillsOnly([
    bill('2026-11', ALUGUEL, 300000, 'ana'),
    bill('2026-11', LUZ, 30000, 'bia'),
    bill('2026-11', MERCADO, 9000, 'caio', ['bia', 'caio']),
    bill('2026-11', LUZ, 12345, null), // ainda não paga: não entra no acerto
  ]);
  const totals = memberTotals(bills, '2026-11', '2026-11');
  const transfers = settleUp(totals);
  assert.deepEqual(transfers, [
    { from: 'caio', to: 'ana', amountCents: 105500 },
    { from: 'bia', to: 'ana', amountCents: 84500 },
  ]);

  const balance = new Map(totals.map((t) => [t.userId, t.balanceCents]));
  for (const t of transfers) {
    balance.set(t.from, balance.get(t.from)! + t.amountCents);
    balance.set(t.to, balance.get(t.to)! - t.amountCents);
  }
  assert.ok([...balance.values()].every((v) => v === 0));
});
