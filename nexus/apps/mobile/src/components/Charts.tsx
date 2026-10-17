import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { T } from './ui';

export function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0] ?? { label: '', value: 0 });
  return (
    <View style={{ padding: 16 }}>
      <T v="caption" style={{ marginBottom: 6 }}>
        Максимум: {format(peak.value)} ({peak.label})
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 }} accessibilityLabel="График расхода по дням">
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%`, backgroundColor: d.value > 0 ? c.accent : c.border, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 1 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <T v="caption">{data[0]?.label}</T>
        <T v="caption">{data[data.length - 1]?.label}</T>
      </View>
    </View>
  );
}

export function Donut({ data, format, center }: { data: { label: string; value: number }[]; format: (v: number) => string; center: string }) {
  const { c } = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
      <View style={{ width: 130, height: 130, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={130} height={130} viewBox="0 0 130 130">
          <G rotation={-90} origin="65, 65">
            <Circle cx={65} cy={65} r={r} stroke={c.border} strokeWidth={16} fill="none" />
            {total > 0
              ? data.map((d, i) => {
                  const len = (d.value / total) * circ;
                  const el = <Circle key={i} cx={65} cy={65} r={r} stroke={c.chart[i % c.chart.length]} strokeWidth={16} fill="none" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />;
                  offset += len;
                  return el;
                })
              : null}
          </G>
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <T style={{ fontWeight: '700', fontSize: 15 }}>{center}</T>
        </View>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {data.slice(0, 8).map((d, i) => (
          <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.chart[i % c.chart.length] }} />
            <T v="small" style={{ flex: 1, color: c.text }} numberOfLines={1}>
              {d.label}
            </T>
            <T v="small">{format(d.value)}</T>
          </View>
        ))}
      </View>
    </View>
  );
}
