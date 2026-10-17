import '@/lib/polyfills';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Button, Icon, T } from '@/components/ui';
import { getDb } from '@/lib/db';
import { refreshPriceBook, syncFxRates, syncOpenRouterPrices } from '@/lib/pricing';
import { bootstrapProviders } from '@/lib/providers';
import { useTheme } from '@/lib/theme';
import { checkForUpdate } from '@/lib/updates';
import { settings, useSettings } from '@/store/settings';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export { ErrorBoundary } from 'expo-router';

function LockGate({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const enabled = useSettings((s) => s.biometricLock);
  const [locked, setLocked] = useState(enabled);
  const backgroundAt = useRef<number | null>(null);

  const unlock = () =>
    LocalAuthentication.authenticateAsync({ promptMessage: 'Разблокировать Nexus', cancelLabel: 'Отмена' })
      .then((r) => r.success && setLocked(false))
      .catch(() => undefined);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') backgroundAt.current = Date.now();
      if (st === 'active' && backgroundAt.current && Date.now() - backgroundAt.current > 60_000) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    if (!locked || !enabled) return;
    LocalAuthentication.authenticateAsync({ promptMessage: 'Разблокировать Nexus', cancelLabel: 'Отмена' })
      .then((r) => r.success && setLocked(false))
      .catch(() => undefined);
  }, [locked, enabled]);

  if (!locked || !enabled) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Icon name="lock-closed-outline" size={48} color={c.accent} />
      <T v="h2">Nexus заблокирован</T>
      <Button title="Разблокировать" icon="finger-print" onPress={() => void unlock()} />
    </View>
  );
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await getDb();
        await settings().load();
        await bootstrapProviders();
        await refreshPriceBook();
      } catch (e) {
        setFatal((e as Error).message);
      } finally {
        setReady(true);
        void SplashScreen.hideAsync().catch(() => undefined);
      }
      void syncOpenRouterPrices().catch(() => undefined);
      void syncFxRates().catch(() => undefined);
      const st = settings();
      if (st.onboarded && st.autoUpdateCheck && Date.now() - st.updateCheckedAt > 86_400_000) {
        void checkForUpdate()
          .then(async (u) => {
            await st.set('updateCheckedAt', Date.now());
            if (u) Alert.alert('Доступно обновление', `Nexus ${u.version}`, [{ text: 'Позже', style: 'cancel' }, { text: 'Подробнее', onPress: () => router.push('/settings/updates') }]);
          })
          .catch(() => undefined);
      }
    })();
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bg).catch(() => undefined);
  }, [c.bg]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const chatId = (r.notification.request.content.data as { chatId?: string } | undefined)?.chatId;
      if (chatId) router.navigate(`/chat/${chatId}` as never);
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;
  if (fatal) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Icon name="alert-circle-outline" size={40} color={c.danger} />
        <T v="h2">Не удалось запустить приложение</T>
        <T v="small" selectable style={{ textAlign: 'center' }}>
          {fatal}
        </T>
      </View>
    );
  }

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: { ...(dark ? DarkTheme : DefaultTheme).colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.accent },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <LockGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.bg },
              headerTintColor: c.text,
              headerShadowVisible: false,
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: c.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="preview" options={{ title: 'Превью', presentation: 'modal' }} />
            <Stack.Screen name="scan" options={{ title: 'Сканировать QR', presentation: 'modal' }} />
            <Stack.Screen name="pair" options={{ title: 'Сопряжение' }} />
            <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
            <Stack.Screen name="mcp/add" options={{ title: 'Добавить MCP-сервер' }} />
            <Stack.Screen name="settings/index" options={{ title: 'Настройки' }} />
            <Stack.Screen name="settings/providers" options={{ title: 'Провайдеры ИИ' }} />
            <Stack.Screen name="settings/provider/[id]" options={{ title: 'Провайдер' }} />
            <Stack.Screen name="settings/mcp" options={{ title: 'Инструменты (MCP)' }} />
            <Stack.Screen name="settings/mcp-server/[id]" options={{ title: 'MCP-сервер' }} />
            <Stack.Screen name="settings/relay" options={{ title: 'Компьютер' }} />
            <Stack.Screen name="settings/usage" options={{ title: 'Расход' }} />
            <Stack.Screen name="settings/budgets" options={{ title: 'Бюджеты' }} />
            <Stack.Screen name="settings/pricing" options={{ title: 'Цены моделей' }} />
            <Stack.Screen name="settings/appearance" options={{ title: 'Внешний вид' }} />
            <Stack.Screen name="settings/privacy" options={{ title: 'Приватность и данные' }} />
            <Stack.Screen name="settings/projects" options={{ title: 'Проекты' }} />
            <Stack.Screen name="settings/project/[id]" options={{ title: 'Проект' }} />
            <Stack.Screen name="settings/updates" options={{ title: 'Обновления' }} />
            <Stack.Screen name="settings/chat" options={{ title: 'Чат и модели' }} />
          </Stack>
        </LockGate>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
