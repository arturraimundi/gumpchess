import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useRepublic } from '@/context/RepublicContext';
import { formatBRL } from '@/domain/money';
import { monthLabel } from '@/domain/reports';
import * as api from '@/lib/api';
import { Button, Card, Chip, ErrorText, Label, Loading, Muted, Row, Screen, Title } from '@/ui/components';
import { colors, space } from '@/ui/theme';

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onYes();
    return;
  }
  Alert.alert('Confirmar', message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: onYes },
  ]);
}

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { memberName, activeMembers, userId, isAdmin, bumpBills } = useRepublic();
  const [bill, setBill] = useState<api.BillWithMeta | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const found = await api.getBill(id);
      setBill(found);
      if (!found) setError('Conta não encontrada.');
    } catch (e) {
      setError(api.friendlyError(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!bill) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const canEditPayer = isAdmin || bill.createdBy === userId;
  const canDelete = isAdmin || bill.createdBy === userId;

  async function run(fn: () => Promise<void>) {
    setError('');
    try {
      await fn();
      bumpBills();
      await load();
    } catch (e) {
      setError(api.friendlyError(e));
    }
  }

  return (
    <Screen>
      <Card>
        <Muted>
          {bill.kind === 'fixed' ? 'Conta fixa' : 'Conta variável'} · {monthLabel(bill.month)}
        </Muted>
        <Title>{bill.categoryName}</Title>
        {bill.description ? <Text style={{ color: colors.text }}>{bill.description}</Text> : null}
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{formatBRL(bill.amountCents)}</Text>
      </Card>

      <Card>
        <Label>Quem pagou</Label>
        {canEditPayer ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="Ainda não paga" selected={!bill.paidBy} onPress={() => run(() => api.setBillPayer(bill.id, null))} />
            {activeMembers.map((m) => (
              <Chip
                key={m.userId}
                label={m.name}
                selected={bill.paidBy === m.userId}
                onPress={() => run(() => api.setBillPayer(bill.id, m.userId))}
              />
            ))}
          </Row>
        ) : (
          <>
            <Text style={{ color: colors.text }}>{bill.paidBy ? memberName(bill.paidBy) : 'Ainda não paga'}</Text>
            {!bill.paidBy && userId ? (
              <Button variant="secondary" title="Eu paguei" onPress={() => run(() => api.setBillPayer(bill.id, userId))} />
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <Label>Divisão</Label>
        {bill.shares.map((s) => {
          const isPayer = s.userId === bill.paidBy;
          const canSettle = !!bill.paidBy && !isPayer && (s.userId === userId || bill.paidBy === userId || isAdmin);
          return (
            <View key={s.userId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space(1), gap: space(2) }}>
              <Text style={{ flex: 1, color: colors.text }}>{memberName(s.userId)}</Text>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{formatBRL(s.amountCents)}</Text>
              {bill.paidBy && !isPayer ? (
                <Pressable
                  disabled={!canSettle}
                  onPress={() => run(() => api.setShareSettled(bill.id, s.userId, !s.settled))}
                  style={{ minWidth: 84, alignItems: 'flex-end' }}
                >
                  <Text style={{ color: s.settled ? colors.down : canSettle ? colors.primary : colors.muted }}>
                    {s.settled ? '✓ acertado' : canSettle ? 'marcar pago' : 'pendente'}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ minWidth: 84 }} />
              )}
            </View>
          );
        })}
      </Card>

      <ErrorText>{error}</ErrorText>

      {canDelete ? (
        <Button
          variant="danger"
          title="Apagar conta"
          onPress={() =>
            confirm('Apagar esta conta? Isso também remove a divisão dela dos relatórios.', () =>
              run(async () => {
                await api.deleteBill(bill.id);
                router.back();
              }),
            )
          }
        />
      ) : null}
    </Screen>
  );
}
