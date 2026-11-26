import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { RepublicProvider } from '@/context/RepublicContext';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RepublicProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: 'Entrar' }} />
            <Stack.Screen name="onboarding" options={{ title: 'Sua república' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="bill/new" options={{ title: 'Nova conta', presentation: 'modal' }} />
            <Stack.Screen name="bill/[id]" options={{ title: 'Conta' }} />
          </Stack>
        </RepublicProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
