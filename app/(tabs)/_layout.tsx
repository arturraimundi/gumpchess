import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRepublic } from '@/context/RepublicContext';
import { Loading } from '@/ui/components';
import { colors } from '@/ui/theme';

const icon = (glyph: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { session } = useAuth();
  const { current, loading } = useRepublic();

  if (!session) return <Redirect href="/login" />;
  if (loading) return <Loading />;
  if (!current) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: current.name, tabBarLabel: 'Resumo', tabBarIcon: icon('◔') }} />
      <Tabs.Screen name="bills" options={{ title: 'Contas', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="members" options={{ title: 'Moradores', tabBarIcon: icon('☺') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
