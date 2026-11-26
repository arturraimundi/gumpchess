// Camada de acesso ao Supabase. As telas só falam com estas funções.
import { supabase } from './supabase';
import type { Bill, BillKind, MemberRole, MonthKey, Share } from '@/domain/types';
import type { SplitMode } from '@/domain/split';
import { monthToDate } from '@/domain/reports';

export interface Republic {
  id: string;
  name: string;
  role: MemberRole;
}

export interface Member {
  userId: string;
  name: string;
  role: MemberRole;
  joinedAt: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: BillKind;
  isDefault: boolean;
  defaultAmountCents: number | null;
}

export interface CategorySplitDefault {
  userId: string;
  percentage: number | null;
}

const ERRORS: Record<string, string> = {
  forbidden: 'Você não tem permissão para isso.',
  invalid_or_expired_code: 'Código inválido ou expirado.',
  too_many_attempts: 'Muitas tentativas erradas. Tente de novo em 1 hora.',
  last_admin: 'A república precisa de pelo menos um admin.',
  shares_sum_mismatch: 'A divisão não fecha com o total da conta.',
  invalid_participant: 'Alguém na divisão não faz parte da república.',
  duplicate_participant: 'Pessoa repetida na divisão.',
  invalid_category: 'Categoria inválida.',
  invalid_payer: 'Quem pagou precisa ser morador da república.',
  invalid_ttl: 'Validade do código inválida.',
};

/** Traduz códigos de erro do banco para mensagens amigáveis. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);
  for (const key of Object.keys(ERRORS)) if (msg.includes(key)) return ERRORS[key];
  if (msg.includes('duplicate key') && msg.includes('bill_categories')) return 'Já existe uma categoria com esse nome.';
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  return msg;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data;
}

// ---------- Repúblicas ----------

export async function listMyRepublics(userId: string): Promise<Republic[]> {
  const rows = check(
    await supabase
      .from('republic_members')
      .select('role, republics ( id, name )')
      .eq('user_id', userId)
      .is('left_at', null),
  ) as any[];
  return rows
    .filter((r) => r.republics)
    .map((r) => ({ id: r.republics.id, name: r.republics.name, role: r.role }));
}

export async function createRepublic(name: string): Promise<string> {
  return check(await supabase.rpc('create_republic', { p_name: name })) as string;
}

export async function joinRepublic(code: string): Promise<string> {
  const res = check(await supabase.rpc('join_republic', { p_code: code })) as {
    ok: boolean;
    republic_id?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(ERRORS[res.error ?? ''] ?? 'Não foi possível entrar.');
  return res.republic_id!;
}

export async function renameRepublic(id: string, name: string) {
  check(await supabase.from('republics').update({ name }).eq('id', id));
}

// ---------- Membros e convites ----------

export async function listMembers(republicId: string): Promise<Member[]> {
  const rows = check(
    await supabase
      .from('republic_members')
      .select('user_id, role, joined_at, left_at, profiles ( display_name )')
      .eq('republic_id', republicId)
      .order('joined_at'),
  ) as any[];
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.profiles?.display_name ?? 'Morador',
    role: r.role,
    joinedAt: r.joined_at,
    active: r.left_at === null,
  }));
}

export async function generateInviteCode(republicId: string, ttlMinutes = 24 * 60) {
  const rows = check(
    await supabase.rpc('generate_invite_code', { p_republic_id: republicId, p_ttl_minutes: ttlMinutes }),
  ) as { code: string; expires_at: string }[];
  return { code: rows[0].code, expiresAt: rows[0].expires_at };
}

export async function getActiveInviteCode(republicId: string) {
  const rows = check(
    await supabase
      .from('invite_codes')
      .select('code, expires_at')
      .eq('republic_id', republicId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
  ) as { code: string; expires_at: string }[];
  return rows[0] ? { code: rows[0].code, expiresAt: rows[0].expires_at } : null;
}

export async function revokeInviteCodes(republicId: string) {
  check(
    await supabase
      .from('invite_codes')
      .update({ revoked_at: new Date().toISOString() })
      .eq('republic_id', republicId)
      .is('revoked_at', null),
  );
}

export async function setMemberRole(republicId: string, userId: string, role: MemberRole) {
  check(await supabase.rpc('set_member_role', { p_republic_id: republicId, p_user_id: userId, p_role: role }));
}

export async function removeMember(republicId: string, userId: string) {
  check(await supabase.rpc('remove_member', { p_republic_id: republicId, p_user_id: userId }));
}

// ---------- Categorias ----------

export async function listCategories(republicId: string): Promise<Category[]> {
  const rows = check(
    await supabase
      .from('bill_categories')
      .select('id, name, kind, is_default, default_amount_cents')
      .eq('republic_id', republicId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('name'),
  ) as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    isDefault: r.is_default,
    defaultAmountCents: r.default_amount_cents === null ? null : Number(r.default_amount_cents),
  }));
}

export async function createCategory(
  republicId: string,
  input: { name: string; kind: BillKind; defaultAmountCents: number | null },
) {
  check(
    await supabase.from('bill_categories').insert({
      republic_id: republicId,
      name: input.name.trim(),
      kind: input.kind,
      default_amount_cents: input.defaultAmountCents,
    }),
  );
}

export async function updateCategory(id: string, patch: { kind?: BillKind; defaultAmountCents?: number | null }) {
  const row: Record<string, unknown> = {};
  if (patch.kind) row.kind = patch.kind;
  if (patch.defaultAmountCents !== undefined) row.default_amount_cents = patch.defaultAmountCents;
  check(await supabase.from('bill_categories').update(row).eq('id', id));
}

export async function archiveCategory(id: string) {
  check(await supabase.from('bill_categories').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

export async function getCategorySplitDefaults(categoryId: string): Promise<CategorySplitDefault[]> {
  const rows = check(
    await supabase.from('category_split_defaults').select('user_id, percentage').eq('category_id', categoryId),
  ) as any[];
  return rows.map((r) => ({ userId: r.user_id, percentage: r.percentage === null ? null : Number(r.percentage) }));
}

/** Salva a divisão padrão de uma categoria. Lista vazia = volta para "igual entre todos". */
export async function setCategorySplitDefaults(categoryId: string, rows: CategorySplitDefault[]) {
  check(await supabase.from('category_split_defaults').delete().eq('category_id', categoryId));
  if (rows.length === 0) return;
  check(
    await supabase
      .from('category_split_defaults')
      .insert(rows.map((r) => ({ category_id: categoryId, user_id: r.userId, percentage: r.percentage }))),
  );
}

// ---------- Contas ----------

export interface NewBill {
  republicId: string;
  categoryId: string;
  amountCents: number;
  month: MonthKey;
  shares: Share[];
  splitMode: SplitMode;
  description?: string;
  dueDate?: string | null;
  paidBy?: string | null;
}

export async function createBill(b: NewBill): Promise<string> {
  return check(
    await supabase.rpc('create_bill', {
      p_republic_id: b.republicId,
      p_category_id: b.categoryId,
      p_amount_cents: b.amountCents,
      p_reference_month: monthToDate(b.month),
      p_shares: b.shares.map((s) => ({ user_id: s.userId, amount_cents: s.amountCents })),
      p_split_mode: b.splitMode,
      p_description: b.description ?? null,
      p_due_date: b.dueDate ?? null,
      p_paid_by: b.paidBy ?? null,
    }),
  ) as string;
}

export async function deleteBill(id: string) {
  check(await supabase.from('bills').delete().eq('id', id));
}

/** Registra quem pagou a conta (qualquer morador pode marcar "eu paguei"; admin/autor podem marcar qualquer um). */
export async function setBillPayer(billId: string, userId: string | null) {
  check(await supabase.rpc('set_bill_payer', { p_bill_id: billId, p_paid_by: userId }));
}

export async function setShareSettled(billId: string, userId: string, settled: boolean) {
  check(
    await supabase
      .from('bill_shares')
      .update({ settled_at: settled ? new Date().toISOString() : null })
      .eq('bill_id', billId)
      .eq('user_id', userId),
  );
}

export interface BillWithMeta extends Bill {
  createdBy: string;
  createdAt: string;
  dueDate: string | null;
}

const BILL_SELECT =
  'id, reference_month, description, amount_cents, paid_by, due_date, created_by, created_at, ' +
  'bill_categories ( id, name, kind ), bill_shares ( user_id, amount_cents, settled_at )';

function toBill(r: any): BillWithMeta {
  return {
    id: r.id,
    month: String(r.reference_month).slice(0, 7),
    categoryId: r.bill_categories.id,
    categoryName: r.bill_categories.name,
    kind: r.bill_categories.kind,
    description: r.description,
    amountCents: Number(r.amount_cents),
    paidBy: r.paid_by,
    shares: (r.bill_shares as any[]).map((s) => ({
      userId: s.user_id,
      amountCents: Number(s.amount_cents),
      settled: s.settled_at !== null,
    })),
    createdBy: r.created_by,
    createdAt: r.created_at,
    dueDate: r.due_date,
  };
}

/** Busca as contas de um intervalo de meses já no formato usado pelos relatórios. */
export async function listBills(republicId: string, from: MonthKey, to: MonthKey): Promise<BillWithMeta[]> {
  const rows = check(
    await supabase
      .from('bills')
      .select(BILL_SELECT)
      .eq('republic_id', republicId)
      .gte('reference_month', monthToDate(from))
      .lte('reference_month', monthToDate(to))
      .order('reference_month', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as any[];
  return rows.map(toBill);
}

export async function getBill(id: string): Promise<BillWithMeta | null> {
  const row = check(await supabase.from('bills').select(BILL_SELECT).eq('id', id).maybeSingle());
  return row ? toBill(row) : null;
}
