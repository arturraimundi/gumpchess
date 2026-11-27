// Gráficos simples feitos só com View (sem dependência nativa extra).
import React from 'react';
import { Text, View } from 'react-native';
import { colors, space } from './theme';
import { formatBRL } from '@/domain/money';

export interface StackedBar {
  label: string;
  /** Segmentos de baixo para cima. */
  segments: { value: number; color: string }[];
  highlighted?: boolean;
}

/** Barras verticais empilhadas (ex.: fixas + variáveis por mês). */
export function StackedBarChart({ bars, height = 160 }: { bars: StackedBar[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.segments.reduce((a, s) => a + s.value, 0)));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: space(2) }}>
        {bars.map((bar) => {
          const total = bar.segments.reduce((a, s) => a + s.value, 0);
          return (
            <View key={bar.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height }}>
              <View
                style={{
                  width: '70%',
                  height: Math.max(total > 0 ? 2 : 0, (total / max) * (height - 4)),
                  flexDirection: 'column-reverse',
                  borderRadius: 4,
                  overflow: 'hidden',
                  opacity: bar.highlighted === false ? 0.45 : 1,
                }}
              >
                {bar.segments.map((s, i) =>
                  s.value > 0 ? <View key={i} style={{ flex: s.value, backgroundColor: s.color }} /> : null,
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(1) }}>
        {bars.map((bar) => (
          <Text
            key={bar.label}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 11,
              color: bar.highlighted ? colors.text : colors.muted,
              fontWeight: bar.highlighted ? '700' : '400',
            }}
          >
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Barras horizontais com rótulo e valor (ex.: gasto por pessoa ou por categoria). */
export function HorizontalBars({
  rows,
}: {
  rows: { key: string; label: string; value: number; color?: string; detail?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: space(3) }}>
      {rows.map((r) => (
        <View key={r.key}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space(1) }}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{r.label}</Text>
            <Text style={{ color: colors.text }}>{formatBRL(r.value)}</Text>
          </View>
          <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${(r.value / max) * 100}%`, height: 8, backgroundColor: r.color ?? colors.primary }} />
          </View>
          {r.detail ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{r.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: space(4) }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: i.color }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
