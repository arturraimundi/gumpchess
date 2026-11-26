import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShares, defaultSplitRule, SplitError, trySplit } from './split.ts';

const sum = (shares: { amountCents: number }[]) => shares.reduce((a, s) => a + s.amountCents, 0);

test('divisão padrão é igual entre todos os membros', () => {
  const shares = computeShares(30000, defaultSplitRule(['a', 'b', 'c']));
  assert.deepEqual(shares, [
    { userId: 'a', amountCents: 10000 },
    { userId: 'b', amountCents: 10000 },
    { userId: 'c', amountCents: 10000 },
  ]);
});

test('centavos que sobram vão para os primeiros, e a soma fecha exatamente', () => {
  const shares = computeShares(10000, defaultSplitRule(['a', 'b', 'c']));
  assert.deepEqual(
    shares.map((s) => s.amountCents),
    [3334, 3333, 3333],
  );
  assert.equal(sum(shares), 10000);
});

test('divisão igual só entre participantes selecionados', () => {
  const shares = computeShares(9000, { mode: 'equal', participants: ['b', 'c'] });
  assert.deepEqual(shares, [
    { userId: 'b', amountCents: 4500 },
    { userId: 'c', amountCents: 4500 },
  ]);
});

test('soma sempre fecha para muitos valores e tamanhos de grupo', () => {
  for (let n = 1; n <= 9; n++) {
    const ids = Array.from({ length: n }, (_, i) => `u${i}`);
    for (const total of [1, 7, 99, 100, 101, 12345, 99999, 1000003]) {
      const shares = computeShares(total, defaultSplitRule(ids));
      assert.equal(sum(shares), total);
      const max = Math.max(...shares.map((s) => s.amountCents));
      const min = Math.min(...shares.map((s) => s.amountCents));
      assert.ok(max - min <= 1, 'diferença entre partes iguais é no máximo 1 centavo');
    }
  }
});

test('divisão por percentual, com casas decimais', () => {
  const shares = computeShares(100000, { mode: 'percentage', percentages: { a: 50, b: 25.5, c: 24.5 } });
  assert.deepEqual(shares, [
    { userId: 'a', amountCents: 50000 },
    { userId: 'b', amountCents: 25500 },
    { userId: 'c', amountCents: 24500 },
  ]);
});

test('percentual com arredondamento fecha o total', () => {
  const shares = computeShares(1001, { mode: 'percentage', percentages: { a: 33.33, b: 33.33, c: 33.34 } });
  assert.equal(sum(shares), 1001);
});

test('percentual que não soma 100 é rejeitado', () => {
  assert.throws(
    () => computeShares(1000, { mode: 'percentage', percentages: { a: 50, b: 40 } }),
    (e: unknown) => e instanceof SplitError && /90\.00%/.test(e.message),
  );
});

test('percentual com mais de duas casas é rejeitado', () => {
  assert.throws(() => computeShares(1000, { mode: 'percentage', percentages: { a: 33.333, b: 66.667 } }), SplitError);
});

test('participantes com 0% ficam de fora', () => {
  const shares = computeShares(1000, { mode: 'percentage', percentages: { a: 100, b: 0 } });
  assert.deepEqual(shares, [{ userId: 'a', amountCents: 1000 }]);
});

test('valores personalizados precisam somar o total', () => {
  const ok = computeShares(1000, { mode: 'custom', amounts: { a: 700, b: 300 } });
  assert.deepEqual(ok, [
    { userId: 'a', amountCents: 700 },
    { userId: 'b', amountCents: 300 },
  ]);
  assert.throws(() => computeShares(1000, { mode: 'custom', amounts: { a: 700, b: 200 } }), SplitError);
});

test('rejeita total zero, negativo ou fracionado', () => {
  for (const total of [0, -100, 10.5]) {
    assert.throws(() => computeShares(total, defaultSplitRule(['a'])), SplitError);
  }
});

test('rejeita lista vazia e participante duplicado', () => {
  assert.throws(() => computeShares(100, { mode: 'equal', participants: [] }), SplitError);
  assert.throws(() => computeShares(100, { mode: 'equal', participants: ['a', 'a'] }), SplitError);
});

test('trySplit devolve erro amigável em vez de lançar', () => {
  assert.deepEqual(trySplit(null, defaultSplitRule(['a'])), { ok: false, error: 'Informe o valor da conta.' });
  const r = trySplit(100, { mode: 'equal', participants: [] });
  assert.equal(r.ok, false);
});
