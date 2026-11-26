/** Códigos de convite: 7 dígitos numéricos, gerados pelo servidor e com validade limitada. */

export const INVITE_CODE_LENGTH = 7;

/** Remove tudo que não é dígito (o usuário pode colar "123-4567" ou "123 4567"). */
export function normalizeInviteCode(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidInviteCode(input: string): boolean {
  // Aceita espaços e hífens como separadores, mas rejeita letras e outros símbolos.
  return /^\d{7}$/.test(input.replace(/[\s-]/g, ''));
}

/** "1234567" -> "123-4567" (mais fácil de ditar). */
export function formatInviteCode(code: string): string {
  const digits = normalizeInviteCode(code);
  if (digits.length !== INVITE_CODE_LENGTH) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export interface TimeLeft {
  expired: boolean;
  totalSeconds: number;
  label: string;
}

/** Tempo restante até a expiração, com rótulo amigável ("23h 59min", "4min 10s", "expirado"). */
export function inviteTimeLeft(expiresAt: Date | string, now: Date = new Date()): TimeLeft {
  const end = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const totalSeconds = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  if (totalSeconds === 0) return { expired: true, totalSeconds: 0, label: 'expirado' };

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${minutes}min`;
  else if (minutes > 0) label = `${minutes}min ${seconds}s`;
  else label = `${seconds}s`;
  return { expired: false, totalSeconds, label };
}
