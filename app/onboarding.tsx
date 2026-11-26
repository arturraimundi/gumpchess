import { router } from 'expo-router';
import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRepublic } from '@/context/RepublicContext';
import { isValidInviteCode, normalizeInviteCode } from '@/domain/inviteCode';
import * as api from '@/lib/api';
import { Button, Card, ErrorText, Input, Muted, Screen, Title } from '@/ui/components';

/** Criar uma república nova ou entrar numa existente com o código de 7 dígitos. */
export default function Onboarding() {
  const { signOut } = useAuth();
  const { select, republics } = useRepublic();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  async function create() {
    setError('');
    if (!name.trim()) return setError('Dê um nome para a república.');
    setBusy('create');
    try {
      const id = await api.createRepublic(name);
      await select(id);
      router.replace('/(tabs)');
    } catch (e) {
      setError(api.friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    setError('');
    if (!isValidInviteCode(code)) return setError('O código tem 7 números.');
    setBusy('join');
    try {
      const id = await api.joinRepublic(normalizeInviteCode(code));
      await select(id);
      router.replace('/(tabs)');
    } catch (e) {
      setError(api.friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Card>
        <Title>Entrar com código</Title>
        <Muted>Peça para o admin da república gerar um código na aba Moradores.</Muted>
        <Input
          label="Código de 7 dígitos"
          value={code}
          onChangeText={(t) => setCode(normalizeInviteCode(t).slice(0, 7))}
          keyboardType="number-pad"
          maxLength={7}
          placeholder="0000000"
          style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center' }}
        />
        <Button title="Entrar na república" onPress={join} loading={busy === 'join'} />
      </Card>

      <Card>
        <Title>Criar uma república</Title>
        <Muted>Você vira admin e já começa com as contas padrão (aluguel, luz, água...).</Muted>
        <Input label="Nome da república" value={name} onChangeText={setName} placeholder="Ex.: Rep Toca" />
        <Button title="Criar república" onPress={create} loading={busy === 'create'} />
      </Card>

      <ErrorText>{error}</ErrorText>

      {republics.length > 0 ? (
        <Button variant="secondary" title="Voltar" onPress={() => router.back()} />
      ) : (
        <Button variant="secondary" title="Sair da conta" onPress={signOut} />
      )}
    </Screen>
  );
}
