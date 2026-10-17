import { View } from 'react-native';
import { Chip, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { syncFxRates } from '@/lib/pricing';
import { useSettings } from '@/store/settings';

export default function Appearance() {
  const s = useSettings();
  return (
    <Screen>
      <Section title="Тема">
        <View style={{ flexDirection: 'row', gap: 6, padding: 14 }}>
          {(
            [
              ['system', 'Системная'],
              ['light', 'Светлая'],
              ['dark', 'Тёмная'],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} label={l} active={s.themeMode === k} onPress={() => void s.set('themeMode', k)} />
          ))}
        </View>
        <Row title="Шрифт с засечками в ответах" subtitle="Как в приложении Claude" right={<Toggle value={s.serifFont} onChange={(v) => void s.set('serifFont', v)} />} />
      </Section>
      <Section title="Язык интерфейса">
        <View style={{ flexDirection: 'row', gap: 6, padding: 14 }}>
          <Chip label="Русский" active={s.language === 'ru'} onPress={() => void s.set('language', 'ru')} />
          <Chip label="English" active={s.language === 'en'} onPress={() => void s.set('language', 'en')} />
        </View>
      </Section>
      <Section title="Валюта расхода" footer={s.fx ? `Курс: 1 USD = ${s.fx.RUB.toFixed(2)} ₽ = ${s.fx.EUR.toFixed(3)} € (${new Date(s.fx.updatedAt).toLocaleDateString('ru-RU')})` : 'Курс загрузится при подключении к интернету.'}>
        <View style={{ flexDirection: 'row', gap: 6, padding: 14 }}>
          {(['USD', 'RUB', 'EUR'] as const).map((cur) => (
            <Chip
              key={cur}
              label={cur}
              active={s.currency === cur}
              onPress={() => {
                void s.set('currency', cur);
                if (cur !== 'USD') void syncFxRates().catch(() => undefined);
              }}
            />
          ))}
        </View>
      </Section>
      <T v="caption">Цены провайдеров указаны в долларах; другие валюты пересчитываются по курсу open.er-api.com раз в сутки.</T>
    </Screen>
  );
}
