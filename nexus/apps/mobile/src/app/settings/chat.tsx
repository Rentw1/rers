import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Chip, Field, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { ModelPicker } from '@/components/ModelPicker';
import { resolveModel } from '@/lib/providers';
import { useSettings } from '@/store/settings';

export default function ChatSettings() {
  const s = useSettings();
  const [picker, setPicker] = useState(false);
  const [modelName, setModelName] = useState(s.defaultModelId);
  const [instructions, setInstructions] = useState(s.customInstructions);
  const [maxTokens, setMaxTokens] = useState(s.maxOutputTokens ? String(s.maxOutputTokens) : '');

  useEffect(() => {
    void resolveModel(s.defaultProviderId, s.defaultModelId).then((m) => setModelName(m.name));
  }, [s.defaultProviderId, s.defaultModelId]);

  return (
    <Screen keyboard>
      <Section title="Модель по умолчанию">
        <Row first icon="sparkles-outline" title={modelName} subtitle={s.defaultProviderId} chevron onPress={() => setPicker(true)} />
      </Section>

      <Section title="Ваши инструкции" footer="Добавляются в системный промпт каждого чата: кто вы, как отвечать, предпочтения по стилю.">
        <View style={{ padding: 12 }}>
          <Field value={instructions} onChangeText={setInstructions} onBlur={() => void s.set('customInstructions', instructions)} multiline placeholder="Например: отвечай кратко, я разработчик на TypeScript" style={{ minHeight: 110 }} />
        </View>
      </Section>

      <Section title="Отображение">
        <Row first title="Показывать размышления" subtitle="Блок «Размышления» у моделей с рассуждениями" right={<Toggle value={s.showReasoning} onChange={(v) => void s.set('showReasoning', v)} />} />
        <Row title="Показывать стоимость" subtitle="Токены и цена под каждым ответом" right={<Toggle value={s.showCost} onChange={(v) => void s.set('showCost', v)} />} />
        <Row title="Автоназвания чатов" subtitle="Короткий запрос к модели после первого ответа" right={<Toggle value={s.autoTitle} onChange={(v) => void s.set('autoTitle', v)} />} />
        <Row title="Вибрация" right={<Toggle value={s.haptics} onChange={(v) => void s.set('haptics', v)} />} />
      </Section>

      <Section title="Озвучка ответов" footer="Кнопка 🔊 под ответом читает его вслух голосом системы Android.">
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', padding: 14 }}>
          {[0.8, 1, 1.2, 1.5, 2].map((r) => (
            <Chip key={r} label={`${r}×`} active={s.ttsRate === r} onPress={() => void s.set('ttsRate', r)} />
          ))}
        </View>
      </Section>

      <Section title="Параметры генерации" footer="Пусто — значения модели по умолчанию. Некоторые модели (рассуждающие, Claude 5) игнорируют или не принимают температуру.">
        <View style={{ padding: 12, gap: 8 }}>
          <T v="small">Температура</T>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[null, 0, 0.3, 0.7, 1, 1.3].map((t) => (
              <Chip key={String(t)} label={t === null ? 'Авто' : String(t)} active={s.temperature === t} onPress={() => void s.set('temperature', t)} />
            ))}
          </View>
          <Field
            label="Максимум токенов ответа"
            value={maxTokens}
            onChangeText={(v) => setMaxTokens(v.replace(/\D/g, ''))}
            onBlur={() => void s.set('maxOutputTokens', maxTokens ? Math.min(Number(maxTokens), 128_000) : null)}
            keyboardType="number-pad"
            placeholder="Авто"
          />
        </View>
      </Section>

      <ModelPicker
        visible={picker}
        onClose={() => setPicker(false)}
        current={{ providerId: s.defaultProviderId, modelId: s.defaultModelId }}
        onSelect={(p, m) => {
          void s.set('defaultProviderId', p);
          void s.set('defaultModelId', m);
        }}
      />
    </Screen>
  );
}
