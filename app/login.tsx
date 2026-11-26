import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { friendlyError } from '@/lib/api';
import { Button, Card, ErrorText, Input, Muted, Screen, Title } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setInfo('');
    if (mode === 'signup' && !name.trim()) return setError('Informe seu nome.');
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        router.replace('/');
      } else {
        const { needsConfirmation } = await signUp(email, password, name);
        if (needsConfirmation) setInfo('Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.');
        else router.replace('/');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary, marginTop: 24 }}>Rep</Text>
      <Muted>Contas da república divididas sem planilha e sem briga.</Muted>
      <Card>
        <Title>{mode === 'signin' ? 'Entrar' : 'Criar conta'}</Title>
        {mode === 'signup' && <Input label="Seu nome" value={name} onChangeText={setName} autoComplete="name" />}
        <Input
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        <ErrorText>{error}</ErrorText>
        {info ? <Text style={{ color: colors.primary }}>{info}</Text> : null}
        <Button title={mode === 'signin' ? 'Entrar' : 'Criar conta'} onPress={submit} loading={busy} />
        <Button
          variant="secondary"
          title={mode === 'signin' ? 'Ainda não tenho conta' : 'Já tenho conta'}
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        />
      </Card>
    </Screen>
  );
}
