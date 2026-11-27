import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, parseBRL } from './money.ts';

test('parseBRL entende os formatos que as pessoas digitam', () => {
  const cases: [string, number | null][] = [
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['R$ 1.500,00', 150000],
    [',99', 99],
    ['0,01', 1],
    ['', null],
    ['abc', null],
    ['12,345', null],
    ['-5', null],
  ];
  for (const [input, expected] of cases) {
    assert.equal(parseBRL(input), expected, `parseBRL(${JSON.stringify(input)})`);
  }
});

test('formatBRL formata com milhar e centavos', () => {
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL(5), 'R$ 0,05');
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(100000000), 'R$ 1.000.000,00');
  assert.equal(formatBRL(-2550), '-R$ 25,50');
});

test('parse e format são inversos', () => {
  for (const cents of [1, 99, 100, 123456, 9876543]) {
    assert.equal(parseBRL(formatBRL(cents)), cents);
  }
});
