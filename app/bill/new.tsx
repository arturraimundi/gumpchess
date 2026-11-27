import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useRepublic } from '@/context/RepublicContext';
import { formatBRL, parseBRL } from '@/domain/money';
import { monthKey } from '@/domain/reports';
import { trySplit, type SplitMode, type SplitRule } from '@/domain/split';
import type { MonthKey } from '@/domain/types';
import * as api from '@/lib/api';
import { Button, Card, Chip, ErrorText, Input, Label, Muted, Row, Screen } from '@/ui/components';
import { MonthPicker } from '@/ui/MonthPicker';
import { colors, space } from '@/ui/theme';

const MODES: { mode: SplitMode; label: string }[] = [
  { mode: 'equal', label: 'Igual' },
  { mode: 'percentage', label: 'Por %' },
  { mode: 'custom', label: 'Valores' },
];

export default function NewBill() {
  const params = useLocalSearchParams<{ month?: string }>();
  const { current, categories, activeMembers, userId, isAdmin, bumpBills } = useRepublic();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [month, setMonth] = useState<MonthKey>(params.month ?? monthKey(new Date()));
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [participants, setParticipants] = useState<string[]>(activeMembers.map((m) => m.userId));
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const amountCents = parseBRL(amountText);

  // Ao escolher a categoria: valor sugerido + divisão padrão da categoria.
  useEffect(() => {
    if (!category) return;
    if (category.defaultAmountCents && !amountText) {
      setAmountText(formatBRL(category.defaultAmountCents).replace('R$ ', ''));
    }
    let cancelled = false;
    api.getCategorySplitDefaults(category.id).then((rows) => {
      if (cancelled) return;
      const active = new Set(activeMembers.map((m) => m.userId));
      const valid = rows.filter((r) => active.has(r.userId));
      if (valid.length === 0) {
        setMode('equal');
        setParticipants(activeMembers.map((m) => m.userId));
      } else if (valid.every((r) => r.percentage === null)) {
        setMode('equal');
        setParticipants(valid.map((r) => r.userId));
      } else {
        setMode('percentage');
        setPercentages(Object.fromEntries(valid.map((r) => [r.userId, String(r.percentage ?? 0).replace('.', ',')])));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const rule: SplitRule = useMemo(() => {
    if (mode === 'equal') {
      // mantém a ordem da lista de moradores
      return { mode, participants: activeMembers.map((m) => m.userId).filter((id) => participants.includes(id)) };
    }
    if (mode === 'percentage') {
      const p: Record<string, number> = {};
      for (const m of activeMembers) {
        const v = Number((percentages[m.userId] ?? '').replace(',', '.'));
        if (percentages[m.userId] && !Number.isNaN(v)) p[m.userId] = v;
      }
      return { mode, percentages: p };
    }
    const a: Record<string, number> = {};
    for (const m of activeMembers) {
      const v = parseBRL(amounts[m.userId] ?? '');
      if (v !== null) a[m.userId] = v;
    }
    return { mode, amounts: a };
  }, [mode, participants, percentages, amounts, activeMembers]);

  const preview = trySplit(amountCents, rule);
  const shareOf = (id: string) => (preview.ok ? preview.shares.find((s) => s.userId === id)?.amountCents ?? 0 : null);

  async function save() {
    setError('');
    if (!current) return;
    if (!category) return setError('Escolha a categoria da conta.');
    if (!preview.ok) return setError(preview.error);
    setBusy(true);
    try {
      await api.createBill({
        republicId: current.id,
        categoryId: category.id,
        amountCents: amountCents!,
        month,
        shares: preview.shares,
        splitMode: mode,
        description,
        paidBy,
      });
      if (saveAsDefault && isAdmin && mode !== 'custom') {
        const allEqual = mode === 'equal' && participants.length === activeMembers.length;
        await api.setCategorySplitDefaults(
          category.id,
          allEqual
            ? []
            : mode === 'equal'
              ? participants.map((id) => ({ userId: id, percentage: null }))
              : Object.entries((rule as { percentages: Record<string, number> }).percentages).map(([id, p]) => ({
                  userId: id,
                  percentage: p,
                })),
        );
      }
      bumpBills();
      router.back();
    } catch (e) {
      setError(api.friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const fixed = categories.filter((c) => c.kind === 'fixed');
  const variable = categories.filter((c) => c.kind === 'variable');

  return (
    <Screen footer={<Button title="Salvar conta" onPress={save} loading={busy} />}>
      <Card>
        <Label>Contas fixas</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {fixed.map((c) => (
            <Chip key={c.id} label={c.name} color={colors.fixed} selected={c.id === categoryId} onPress={() => setCategoryId(c.id)} />
          ))}
        </Row>
        <Label>Contas variáveis</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {variable.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={colors.variable}
              selected={c.id === categoryId}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </Row>
        <Muted>Falta alguma? Admins adicionam novas categorias em Ajustes.</Muted>
      </Card>

      <Card>
        <Input label="Valor (R$)" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="0,00" />
        <Input label="Descrição (opcional)" value={description} onChangeText={setDescription} maxLength={120} />
        <Label>Mês de referência</Label>
        <MonthPicker value={month} onChange={setMonth} />
        <Label>Quem pagou</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip label="Ainda não paga" selected={paidBy === null} onPress={() => setPaidBy(null)} />
          {activeMembers.map((m) => (
            <Chip key={m.userId} label={m.name} selected={paidBy === m.userId} onPress={() => setPaidBy(m.userId)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Label>Divisão</Label>
        <Row>
          {MODES.map((m) => (
            <Chip key={m.mode} label={m.label} selected={mode === m.mode} onPress={() => setMode(m.mode)} />
          ))}
        </Row>

        {activeMembers.map((m) => {
          const share = shareOf(m.userId);
          return (
            <View
              key={m.userId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(1) }}
            >
              {mode === 'equal' ? (
                <Pressable
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(2) }}
                  onPress={() =>
                    setParticipants((p) => (p.includes(m.userId) ? p.filter((id) => id !== m.userId) : [...p, m.userId]))
                  }
                >
                  <Text style={{ fontSize: 18, color: colors.primary }}>{participants.includes(m.userId) ? '☑' : '☐'}</Text>
                  <Text style={{ color: colors.text }}>{m.name}</Text>
                </Pressable>
              ) : (
                <Text style={{ flex: 1, color: colors.text }}>{m.name}</Text>
              )}

              {mode === 'percentage' && (
                <Input
                  value={percentages[m.userId] ?? ''}
                  onChangeText={(t) => setPercentages((p) => ({ ...p, [m.userId]: t }))}
                  keyboardType="decimal-pad"
                  placeholder="%"
                  compact
                  style={{ width: 70, paddingVertical: 6 }}
                />
              )}
              {mode === 'custom' && (
                <Input
                  value={amounts[m.userId] ?? ''}
                  onChangeText={(t) => setAmounts((a) => ({ ...a, [m.userId]: t }))}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  compact
                  style={{ width: 100, paddingVertical: 6 }}
                />
              )}
              {mode !== 'custom' && (
                <Text style={{ width: 96, textAlign: 'right', color: colors.muted }}>
                  {share !== null && share > 0 ? formatBRL(share) : '—'}
                </Text>
              )}
            </View>
          );
        })}

        {!preview.ok && amountCents !== null ? <ErrorText>{preview.error}</ErrorText> : null}

        {isAdmin && category && mode !== 'custom' ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space(2) }}>
            <Muted style={{ flex: 1 }}>Usar esta divisão como padrão para {category.name}</Muted>
            <Switch value={saveAsDefault} onValueChange={setSaveAsDefault} />
          </Row>
        ) : null}
      </Card>

      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
