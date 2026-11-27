import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInviteCode, inviteTimeLeft, isValidInviteCode, normalizeInviteCode } from './inviteCode.ts';

test('código válido tem exatamente 7 dígitos', () => {
  assert.equal(isValidInviteCode('1234567'), true);
  assert.equal(isValidInviteCode('123-4567'), true);
  assert.equal(isValidInviteCode(' 123 4567 '), true);
  assert.equal(isValidInviteCode('0000001'), true);
  assert.equal(isValidInviteCode('123456'), false);
  assert.equal(isValidInviteCode('12345678'), false);
  assert.equal(isValidInviteCode('12a4567'), false);
  assert.equal(isValidInviteCode(''), false);
});

test('normaliza e formata', () => {
  assert.equal(normalizeInviteCode('123-4567'), '1234567');
  assert.equal(formatInviteCode('1234567'), '123-4567');
  assert.equal(formatInviteCode('0012345'), '001-2345');
});

test('tempo restante do código', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  assert.deepEqual(inviteTimeLeft('2026-11-26T11:59:00Z', now), { expired: true, totalSeconds: 0, label: 'expirado' });
  assert.equal(inviteTimeLeft('2026-11-26T12:00:30Z', now).label, '30s');
  assert.equal(inviteTimeLeft('2026-11-26T12:04:10Z', now).label, '4min 10s');
  assert.equal(inviteTimeLeft('2026-11-27T11:59:00Z', now).label, '23h 59min');
  assert.equal(inviteTimeLeft('2026-11-29T15:00:00Z', now).label, '3d 3h');
});
