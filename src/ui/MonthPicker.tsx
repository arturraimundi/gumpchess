import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { addMonths, monthLabel } from '@/domain/reports';
import type { MonthKey } from '@/domain/types';
import { colors, space } from './theme';

export function MonthPicker({ value, onChange }: { value: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(4) }}>
      <Pressable accessibilityLabel="Mês anterior" hitSlop={12} onPress={() => onChange(addMonths(value, -1))}>
        <Text style={{ fontSize: 22, color: colors.primary }}>‹</Text>
      </Pressable>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, minWidth: 70, textAlign: 'center' }}>
        {monthLabel(value)}
      </Text>
      <Pressable accessibilityLabel="Próximo mês" hitSlop={12} onPress={() => onChange(addMonths(value, 1))}>
        <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
      </Pressable>
    </View>
  );
}
