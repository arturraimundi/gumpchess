// Tipos compartilhados da lógica de negócio.
// Todos os valores monetários são inteiros em centavos para evitar erros de ponto flutuante.

export type Cents = number;

export type BillKind = 'fixed' | 'variable';

export type MemberRole = 'admin' | 'member';

/** Mês de competência no formato 'YYYY-MM'. */
export type MonthKey = string;

export interface Share {
  userId: string;
  amountCents: Cents;
  /** true quando a pessoa já acertou essa parte diretamente com quem pagou a conta. */
  settled?: boolean;
}

export interface Bill {
  id: string;
  month: MonthKey;
  categoryId: string;
  categoryName: string;
  kind: BillKind;
  description: string | null;
  amountCents: Cents;
  /** Quem pagou a conta (pode ser nulo se ainda não foi paga). */
  paidBy: string | null;
  shares: Share[];
}
