import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRepublic } from '@/context/RepublicContext';
import { formatBRL } from '@/domain/money';
import { monthKey } from '@/domain/reports';
import type { MonthKey } from '@/domain/types';
import * as api from '@/lib/api';
import { Button, ErrorText, Muted } from '@/ui/components';
import { MonthPicker } from '@/ui/MonthPicker';
import { colors, radius, space } from '@/ui/theme';

export default function Bills() {
  const { current, memberName, billsVersion } = useRepublic();
  const [month, setMonth] = useState<MonthKey>(monthKey(new Date()));
  const [bills, setBills] = useState<api.BillWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError('');
    try {
      setBills(await api.listBills(current.id, month, month));
    } catch (e) {
      setError(api.friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [current, month, billsVersion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const total = bills.reduce((a, b) => a + b.amountCents, 0);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={bills}
        keyExtractor={(b) => b.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: space(4), gap: space(2), paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ gap: space(2), marginBottom: space(2) }}>
            <MonthPicker value={month} onChange={setMonth} />
            <Muted style={{ textAlign: 'center' }}>
              {bills.length} conta(s) · {formatBRL(total)}
            </Muted>
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={!loading ? <Muted style={{ textAlign: 'center' }}>Nenhuma conta neste mês.</Muted> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/bill/[id]', params: { id: item.id } })}
            style={{
              backgroundColor: colors.card,
              borderRadius: radius,
              borderWidth: 1,
              borderColor: colors.border,
              padding: space(3),
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(3),
            }}
          >
            <View
              style={{
                width: 6,
                alignSelf: 'stretch',
                borderRadius: 3,
                backgroundColor: item.kind === 'fixed' ? colors.fixed : colors.variable,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{item.categoryName}</Text>
              {item.description ? <Muted>{item.description}</Muted> : null}
              <Muted>
                {item.paidBy ? `Pago por ${memberName(item.paidBy)}` : 'Ainda não paga'} · {item.shares.length} pessoa(s)
              </Muted>
            </View>
            <Text style={{ fontWeight: '700', color: colors.text }}>{formatBRL(item.amountCents)}</Text>
          </Pressable>
        )}
      />
      <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(4) }}>
        <Button title="+ Nova conta" onPress={() => router.push({ pathname: '/bill/new', params: { month } })} />
      </View>
    </View>
  );
}
