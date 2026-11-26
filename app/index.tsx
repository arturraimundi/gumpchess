import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRepublic } from '@/context/RepublicContext';
import { Loading } from '@/ui/components';

/** Decide para onde ir: login -> criar/entrar em república -> app. */
export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { current, loading } = useRepublic();

  if (authLoading || (session && loading)) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!current) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
