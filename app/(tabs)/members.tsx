import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Share, Text, View } from 'react-native';
import { useRepublic } from '@/context/RepublicContext';
import { formatInviteCode, inviteTimeLeft } from '@/domain/inviteCode';
import * as api from '@/lib/api';
import { Button, Card, Chip, ErrorText, Muted, Row, Screen, Title } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const TTL_OPTIONS = [
  { label: '1 hora', minutes: 60 },
  { label: '24 horas', minutes: 24 * 60 },
  { label: '7 dias', minutes: 7 * 24 * 60 },
];

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

export default function Members() {
  const { current, activeMembers, isAdmin, userId, refresh } = useRepublic();
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [ttl, setTtl] = useState(24 * 60);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!current || !isAdmin) return;
    api.getActiveInviteCode(current.id).then(setInvite).catch(() => {});
  }, [current, isAdmin]);

  // Atualiza o contador de validade a cada segundo enquanto há código ativo.
  useEffect(() => {
    if (!invite) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [invite]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setError('');
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        setError(api.friendlyError(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!current) return null;
  const left = invite ? inviteTimeLeft(invite.expiresAt, now) : null;
  const adminCount = activeMembers.filter((m) => m.role === 'admin').length;

  return (
    <Screen>
      {isAdmin ? (
        <Card>
          <Title>Convidar morador</Title>
          <Muted>Gere um código de 7 dígitos. Gerar um novo invalida o anterior.</Muted>
          {invite && left && !left.expired ? (
            <View style={{ alignItems: 'center', paddingVertical: space(2) }}>
              <Text selectable style={{ fontSize: 40, fontWeight: '800', letterSpacing: 4, color: colors.primary }}>
                {formatInviteCode(invite.code)}
              </Text>
              <Muted>expira em {left.label}</Muted>
            </View>
          ) : null}
          <Row style={{ flexWrap: 'wrap' }}>
            {TTL_OPTIONS.map((o) => (
              <Chip key={o.minutes} label={o.label} selected={ttl === o.minutes} onPress={() => setTtl(o.minutes)} />
            ))}
          </Row>
          <Button
            title={invite && left && !left.expired ? 'Gerar novo código' : 'Gerar código'}
            loading={busy}
            onPress={() => run(async () => setInvite(await api.generateInviteCode(current.id, ttl)))}
          />
          {invite && left && !left.expired ? (
            <>
              <Button
                variant="secondary"
                title="Compartilhar"
                onPress={() =>
                  Share.share({
                    message: `Entre na república "${current.name}" no app Rep com o código ${formatInviteCode(invite.code)} (válido por ${left.label}).`,
                  })
                }
              />
              <Button
                variant="secondary"
                title="Cancelar código"
                onPress={() => run(async () => {
                  await api.revokeInviteCodes(current.id);
                  setInvite(null);
                })}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Title>Moradores ({activeMembers.length})</Title>
        {activeMembers.map((m) => {
          const isMe = m.userId === userId;
          return (
            <View key={m.userId} style={{ paddingVertical: space(2), borderBottomWidth: 1, borderColor: colors.border, gap: space(1) }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {m.name}
                  {isMe ? ' (você)' : ''}
                </Text>
                <Text style={{ color: m.role === 'admin' ? colors.primary : colors.muted, fontSize: 12 }}>
                  {m.role === 'admin' ? 'ADMIN' : 'morador'}
                </Text>
              </Row>
              {isAdmin && !isMe ? (
                <Row style={{ gap: space(4) }}>
                  <Text
                    style={{ color: colors.primary }}
                    onPress={() =>
                      run(async () => {
                        await api.setMemberRole(current.id, m.userId, m.role === 'admin' ? 'member' : 'admin');
                        await refresh();
                      })
                    }
                  >
                    {m.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}
                  </Text>
                  <Text
                    style={{ color: colors.danger }}
                    onPress={() =>
                      confirm(`Remover ${m.name} da república? O histórico de gastos é mantido.`, () =>
                        run(async () => {
                          await api.removeMember(current.id, m.userId);
                          await refresh();
                        }),
                      )
                    }
                  >
                    Remover
                  </Text>
                </Row>
              ) : null}
            </View>
          );
        })}
      </Card>

      <ErrorText>{error}</ErrorText>

      <Button
        variant="danger"
        title="Sair da república"
        onPress={() => {
          if (isAdmin && adminCount === 1 && activeMembers.length > 1) {
            setError('Você é o único admin. Torne outra pessoa admin antes de sair.');
            return;
          }
          confirm('Sair desta república?', () =>
            run(async () => {
              await api.removeMember(current.id, userId!);
              await refresh();
              router.replace('/');
            }),
          );
        }}
      />
    </Screen>
  );
}
