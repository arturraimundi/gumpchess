import type { Cents, Share } from './types.ts';

/**
 * Regras de divisão de uma conta.
 * - equal: divide igualmente entre os participantes (padrão: todos os membros).
 * - percentage: cada participante paga um percentual (soma 100%, até 2 casas decimais).
 * - custom: valores exatos em centavos (soma igual ao total).
 */
export type SplitRule =
  | { mode: 'equal'; participants: string[] }
  | { mode: 'percentage'; percentages: Record<string, number> }
  | { mode: 'custom'; amounts: Record<string, Cents> };

export type SplitMode = SplitRule['mode'];

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

/** Divisão padrão: igual entre todos os membros ativos. */
export function defaultSplitRule(memberIds: string[]): SplitRule {
  return { mode: 'equal', participants: [...memberIds] };
}

function assertTotal(totalCents: Cents) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new SplitError('O valor da conta deve ser maior que zero.');
  }
}

function assertUnique(ids: string[]) {
  if (new Set(ids).size !== ids.length) {
    throw new SplitError('Participante repetido na divisão.');
  }
}

/**
 * Distribui `total` proporcionalmente aos pesos usando o método do maior resto,
 * garantindo que a soma das partes seja exatamente o total.
 * Empates no resto favorecem quem aparece primeiro na lista (determinístico).
 */
function distributeByWeights(totalCents: Cents, ids: string[], weights: number[]): Share[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const base = ids.map((_, i) => Math.floor((totalCents * weights[i]) / weightSum));
  const remainders = ids.map((_, i) => (totalCents * weights[i]) % weightSum);
  let missing = totalCents - base.reduce((a, b) => a + b, 0);

  const order = ids
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (const i of order) {
    if (missing === 0) break;
    base[i] += 1;
    missing -= 1;
  }
  return ids.map((userId, i) => ({ userId, amountCents: base[i] }));
}

/** Calcula quanto cada participante deve pagar de uma conta. */
export function computeShares(totalCents: Cents, rule: SplitRule): Share[] {
  assertTotal(totalCents);

  switch (rule.mode) {
    case 'equal': {
      const ids = rule.participants;
      if (ids.length === 0) throw new SplitError('Selecione ao menos uma pessoa.');
      assertUnique(ids);
      return distributeByWeights(totalCents, ids, ids.map(() => 1));
    }

    case 'percentage': {
      const ids = Object.keys(rule.percentages).filter((id) => rule.percentages[id] !== 0);
      if (ids.length === 0) throw new SplitError('Defina o percentual de ao menos uma pessoa.');
      // Trabalha em pontos-base (1% = 100) para aceitar duas casas decimais sem float.
      const bps = ids.map((id) => {
        const p = rule.percentages[id];
        if (!Number.isFinite(p) || p < 0) throw new SplitError('Percentual inválido.');
        const bp = Math.round(p * 100);
        if (Math.abs(bp - p * 100) > 1e-6) {
          throw new SplitError('Use no máximo duas casas decimais nos percentuais.');
        }
        return bp;
      });
      const sum = bps.reduce((a, b) => a + b, 0);
      if (sum !== 10000) {
        throw new SplitError(`Os percentuais somam ${(sum / 100).toFixed(2)}%, precisam somar 100%.`);
      }
      return distributeByWeights(totalCents, ids, bps);
    }

    case 'custom': {
      const ids = Object.keys(rule.amounts).filter((id) => rule.amounts[id] !== 0);
      if (ids.length === 0) throw new SplitError('Defina o valor de ao menos uma pessoa.');
      for (const id of ids) {
        const v = rule.amounts[id];
        if (!Number.isSafeInteger(v) || v < 0) throw new SplitError('Valor individual inválido.');
      }
      const sum = ids.reduce((a, id) => a + rule.amounts[id], 0);
      if (sum !== totalCents) {
        throw new SplitError('A soma dos valores individuais precisa ser igual ao total da conta.');
      }
      return ids.map((userId) => ({ userId, amountCents: rule.amounts[userId] }));
    }
  }
}

/** Valida sem lançar exceção: útil para mostrar erro em tempo real no formulário. */
export function trySplit(
  totalCents: Cents | null,
  rule: SplitRule,
): { ok: true; shares: Share[] } | { ok: false; error: string } {
  if (totalCents === null) return { ok: false, error: 'Informe o valor da conta.' };
  try {
    return { ok: true, shares: computeShares(totalCents, rule) };
  } catch (e) {
    if (e instanceof SplitError) return { ok: false, error: e.message };
    throw e;
  }
}
