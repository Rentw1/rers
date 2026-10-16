import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogEntry, DEFAULT_MODEL_ID } from '@nexus/core';
import { Button, Field, Icon, T } from '@/components/ui';
import { saveProviderSettings, syncModels, testProvider } from '@/lib/providers';
import { useTheme } from '@/lib/theme';
import { settings } from '@/store/settings';

const FEATURES: { icon: 'chatbubbles-outline' | 'construct-outline' | 'desktop-outline' | 'stats-chart-outline'; title: string; text: string }[] = [
  { icon: 'chatbubbles-outline', title: 'Любые модели', text: 'DeepSeek, Claude, GPT, Gemini, OpenRouter, Groq, локальные Ollama и LM Studio.' },
  { icon: 'construct-outline', title: 'Инструменты MCP', text: 'Контакты, календарь, файлы, геолокация телефона и любые MCP-серверы.' },
  { icon: 'desktop-outline', title: 'Связь с компьютером', text: 'Nexus Relay на ПК открывает доступ к файлам и MCP-серверам компьютера.' },
  { icon: 'stats-chart-outline', title: 'Цены и расход', text: 'Стоимость каждого ответа, статистика и лимиты бюджета.' },
];

export default function Onboarding() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1>(0);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const deepseek = catalogEntry('deepseek')!;

  const finish = async () => {
    await settings().set('onboarded', true);
    router.replace('/');
  };

  const saveKey = async () => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await saveProviderSettings('deepseek', { apiKey: key.trim() });
      await testProvider('deepseek');
      await syncModels('deepseek').catch(() => undefined);
      await settings().set('defaultProviderId', 'deepseek');
      await settings().set('defaultModelId', DEFAULT_MODEL_ID);
      await finish();
    } catch (e) {
      Alert.alert('Ключ не подошёл', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View style={{ flex: 1, gap: 22 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkles" size={34} color={c.accentText} />
            </View>
            <T v="title" style={{ fontSize: 32 }}>
              Nexus
            </T>
            <T style={{ fontSize: 18, color: c.textMuted }}>Ваш ИИ-ассистент: любые модели, инструменты телефона и компьютера, прозрачный расход.</T>
            <View style={{ gap: 18, marginTop: 8 }}>
              {FEATURES.map((f) => (
                <View key={f.title} style={{ flexDirection: 'row', gap: 14 }}>
                  <Icon name={f.icon} size={24} color={c.accent} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: '600' }}>{f.title}</T>
                    <T v="small">{f.text}</T>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }} />
            <Button title="Начать" onPress={() => setStep(1)} />
          </View>
        ) : (
          <View style={{ flex: 1, gap: 14 }}>
            <T v="title">Подключите DeepSeek</T>
            <T v="small">DeepSeek — основной провайдер: дёшево и качественно. Ключ хранится только на телефоне в защищённом хранилище Android.</T>
            <View style={{ gap: 6, marginVertical: 4 }}>
              <T v="small">1. Зарегистрируйтесь на platform.deepseek.com и пополните баланс (от $2).</T>
              <T v="small">2. Создайте API-ключ и вставьте его ниже.</T>
            </View>
            <Button kind="ghost" title="Получить ключ DeepSeek" icon="open-outline" onPress={() => void WebBrowser.openBrowserAsync(deepseek.keyUrl!)} />
            <Field label="API-ключ DeepSeek" value={key} onChangeText={setKey} placeholder="sk-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
            <Button title="Сохранить и продолжить" onPress={() => void saveKey()} loading={busy} disabled={!key.trim()} />
            <View style={{ flex: 1 }} />
            <T v="caption" style={{ textAlign: 'center' }}>
              Можно подключить другого провайдера (OpenAI, Claude, Gemini, OpenRouter, Ollama…) позже в настройках.
            </T>
            <Button
              kind="secondary"
              title="Другой провайдер"
              onPress={async () => {
                await finish();
                router.push('/settings/providers');
              }}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
