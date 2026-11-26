import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRepublic } from '@/context/RepublicContext';
import { formatBRL } from '@/domain/money';
import {
  addMonths,
  categoryChanges,
  memberTotals,
  monthKey,
  monthLabel,
  paidBillsOnly,
  settleUp,
  totalsByMonth,
} from '@/domain/reports';
import type { MonthKey } from '@/domain/types';
import * as api from '@/lib/api';
import { HorizontalBars, Legend, StackedBarChart } from '@/ui/charts';
import { Card, Chip, ErrorText, Muted, Row, Title } from '@/ui/components';
import { MonthPicker } from '@/ui/MonthPicker';
import { colors, space } from '@/ui/theme';

const PERIODS = [
  { label: 'Mês', months: 1 },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '12 meses', months: 12 },
];

export default function Dashboard() {
  const { current, memberName, billsVersion } = useRepublic();
  const [month, setMonth] = useState<MonthKey>(monthKey(new Date()));
  const [period, setPeriod] = useState(1);
  const [bills, setBills] = useState<api.BillWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = addMonths(month, -11);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError('');
    try {
      setBills(await api.listBills(current.id, from, month));
    } catch (e) {
      setError(api.friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [current, from, month, billsVersion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const chartMonths = useMemo(() => totalsByMonth(bills, addMonths(month, -5), month), [bills, month]);
  const thisMonth = chartMonths[chartMonths.length - 1];
  const lastMonth = chartMonths[chartMonths.length - 2];
  const changes = useMemo(() => categoryChanges(bills, month), [bills, month]);
  const periodFrom = addMonths(month, -(period - 1));
  const people = useMemo(() => memberTotals(bills, periodFrom, month), [bills, periodFrom, month]);
  const transfers = useMemo(
    () => settleUp(memberTotals(paidBillsOnly(bills), periodFrom, month)),
    [bills, periodFrom, month],
  );

  const diff = thisMonth && lastMonth ? thisMonth.totalCents - lastMonth.totalCents : 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: space(4), gap: space(3) }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <MonthPicker value={month} onChange={setMonth} />
      <ErrorText>{error}</ErrorText>

      <Card>
        <Muted>Total de {monthLabel(month)}</Muted>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>{formatBRL(thisMonth?.totalCents ?? 0)}</Text>
        {lastMonth && lastMonth.totalCents > 0 ? (
          <Text style={{ color: diff > 0 ? colors.up : colors.down }}>
            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {formatBRL(Math.abs(diff))} em relação a {monthLabel(lastMonth.month)}
          </Text>
        ) : null}
        <Row style={{ gap: space(4) }}>
          <Muted>Fixas: {formatBRL(thisMonth?.fixedCents ?? 0)}</Muted>
          <Muted>Variáveis: {formatBRL(thisMonth?.variableCents ?? 0)}</Muted>
        </Row>
      </Card>

      <Card>
        <Title>Últimos 6 meses</Title>
        <StackedBarChart
          bars={chartMonths.map((m) => ({
            label: monthLabel(m.month).slice(0, 3),
            highlighted: m.month === month,
            segments: [
              { value: m.fixedCents, color: colors.fixed },
              { value: m.variableCents, color: colors.variable },
            ],
          }))}
        />
        <Legend
          items={[
            { label: 'Fixas', color: colors.fixed },
            { label: 'Variáveis', color: colors.variable },
          ]}
        />
      </Card>

      <Card>
        <Title>Por categoria</Title>
        <Muted>Comparado com {monthLabel(addMonths(month, -1))}</Muted>
        {changes.length === 0 ? <Muted>Nenhuma conta lançada.</Muted> : null}
        {changes.map((c) => (
          <View key={c.categoryId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), flex: 1 }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.kind === 'fixed' ? colors.fixed : colors.variable }}
              />
              <Text style={{ color: colors.text }}>{c.categoryName}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{formatBRL(c.currentCents)}</Text>
              {c.diffCents !== 0 ? (
                <Text style={{ fontSize: 12, color: c.diffCents > 0 ? colors.up : colors.down }}>
                  {c.diffCents > 0 ? '▲' : '▼'} {formatBRL(Math.abs(c.diffCents))}
                  {c.diffPercent !== null ? ` (${c.diffPercent > 0 ? '+' : ''}${c.diffPercent}%)` : ' (nova)'}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Title>Quanto cada um gastou</Title>
        <Row style={{ flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <Chip key={p.months} label={p.label} selected={period === p.months} onPress={() => setPeriod(p.months)} />
          ))}
        </Row>
        <Muted>
          {period === 1 ? monthLabel(month) : `${monthLabel(periodFrom)} a ${monthLabel(month)}`}
        </Muted>
        {people.length === 0 ? <Muted>Sem gastos no período.</Muted> : null}
        <HorizontalBars
          rows={people.map((p) => ({
            key: p.userId,
            label: memberName(p.userId),
            value: p.shareCents,
            detail: `Pagou ${formatBRL(p.paidCents)}`,
          }))}
        />
      </Card>

      <Card>
        <Title>Acerto de contas</Title>
        <Muted>Considera só as contas com pagador definido e as partes ainda não acertadas.</Muted>
        {transfers.length === 0 ? <Muted>Tudo certo, ninguém deve ninguém. 🎉</Muted> : null}
        {transfers.map((t, i) => (
          <Text key={i} style={{ color: colors.text }}>
            <Text style={{ fontWeight: '700' }}>{memberName(t.from)}</Text> paga{' '}
            <Text style={{ fontWeight: '700' }}>{formatBRL(t.amountCents)}</Text> para{' '}
            <Text style={{ fontWeight: '700' }}>{memberName(t.to)}</Text>
          </Text>
        ))}
      </Card>
    </ScrollView>
  );
}
