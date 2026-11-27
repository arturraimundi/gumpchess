import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRepublic } from '@/context/RepublicContext';
import { formatBRL, parseBRL } from '@/domain/money';
import type { BillKind } from '@/domain/types';
import * as api from '@/lib/api';
import { Button, Card, Chip, ErrorText, Input, Label, Muted, Row, Screen, Title } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function Settings() {
  const { signOut } = useAuth();
  const { current, republics, categories, isAdmin, select, refresh } = useRepublic();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BillKind>('variable');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!current) return null;

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(api.friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function addCategory() {
    if (!name.trim()) return setError('Dê um nome para a conta.');
    const cents = amount.trim() ? parseBRL(amount) : null;
    if (amount.trim() && cents === null) return setError('Valor sugerido inválido.');
    run(async () => {
      await api.createCategory(current!.id, { name, kind, defaultAmountCents: cents });
      setName('');
      setAmount('');
    });
  }

  const section = (title: string, list: api.Category[]) => (
    <View style={{ gap: space(1) }}>
      <Label>{title}</Label>
      {list.map((c) => (
        <Row key={c.id} style={{ justifyContent: 'space-between', paddingVertical: space(1) }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text }}>
              {c.name} {c.isDefault ? <Text style={{ color: colors.muted, fontSize: 12 }}>· padrão</Text> : null}
            </Text>
            {c.defaultAmountCents ? <Muted>Sugerido: {formatBRL(c.defaultAmountCents)}</Muted> : null}
          </View>
          {isAdmin ? (
            <Row style={{ gap: space(3) }}>
              <Text
                style={{ color: colors.primary }}
                onPress={() => run(() => api.updateCategory(c.id, { kind: c.kind === 'fixed' ? 'variable' : 'fixed' }))}
              >
                {c.kind === 'fixed' ? '→ variável' : '→ fixa'}
              </Text>
              <Text style={{ color: colors.danger }} onPress={() => run(() => api.archiveCategory(c.id))}>
                Arquivar
              </Text>
            </Row>
          ) : null}
        </Row>
      ))}
    </View>
  );

  return (
    <Screen>
      <Card>
        <Title>Contas da república</Title>
        <Muted>
          As padrão vêm prontas; as adicionais vocês criam. Arquivar esconde a categoria de novos lançamentos, mas mantém o histórico.
        </Muted>
        {section('Fixas', categories.filter((c) => c.kind === 'fixed'))}
        {section('Variáveis', categories.filter((c) => c.kind === 'variable'))}
      </Card>

      {isAdmin ? (
        <Card>
          <Title>Adicionar conta</Title>
          <Input label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Netflix, Faxineira" maxLength={40} />
          <Label>Tipo</Label>
          <Row>
            <Chip label="Fixa" color={colors.fixed} selected={kind === 'fixed'} onPress={() => setKind('fixed')} />
            <Chip label="Variável" color={colors.variable} selected={kind === 'variable'} onPress={() => setKind('variable')} />
          </Row>
          <Input
            label="Valor sugerido (opcional)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0,00"
          />
          <Button title="Adicionar" onPress={addCategory} loading={busy} />
        </Card>
      ) : null}

      <ErrorText>{error}</ErrorText>

      <Card>
        <Title>Repúblicas</Title>
        <Row style={{ flexWrap: 'wrap' }}>
          {republics.map((r) => (
            <Chip key={r.id} label={r.name} selected={r.id === current.id} onPress={() => select(r.id)} />
          ))}
        </Row>
        <Button variant="secondary" title="Criar ou entrar em outra" onPress={() => router.push('/onboarding')} />
      </Card>

      <Button variant="secondary" title="Sair da conta" onPress={signOut} />
    </Screen>
  );
}
