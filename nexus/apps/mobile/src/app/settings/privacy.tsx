import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { CATALOG } from '@nexus/core';
import { Alert } from 'react-native';
import { Row, Screen, Section, T, Toggle } from '@/components/ui';
import { exportBackup, importBackup } from '@/lib/backup';
import { disconnectAll } from '@/lib/mcp';
import { bootstrapProviders } from '@/lib/providers';
import * as repo from '@/lib/repo';
import { RELAY_TOKEN, apiKeyName, mcpSecretName, setSecret } from '@/lib/secure';
import { runtime } from '@/store/chat';
import { settings, useSettings } from '@/store/settings';

export default function Privacy() {
  const s = useSettings();

  const toggleLock = async (v: boolean) => {
    if (v) {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!has || !enrolled) return Alert.alert('Недоступно', 'На устройстве не настроена биометрия или PIN.');
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Подтвердите включение блокировки' });
      if (!r.success) return;
    }
    await s.set('biometricLock', v);
  };

  const doExport = async () => {
    try {
      const json = await exportBackup();
      const f = new File(Paths.cache, `nexus-backup-${new Date().toISOString().slice(0, 10)}.json`);
      if (f.exists) f.delete();
      f.create();
      f.write(json);
      await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Резервная копия Nexus' });
    } catch (e) {
      Alert.alert('Ошибка', (e as Error).message);
    }
  };

  const doImport = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    try {
      const res = await importBackup(await new File(r.assets[0].uri).text());
      await settings().load();
      runtime.bumpList();
      Alert.alert('Импорт завершён', `Чатов: ${res.chats}, сообщений: ${res.messages}. API-ключи нужно ввести заново.`);
    } catch (e) {
      Alert.alert('Ошибка импорта', (e as Error).message);
    }
  };

  const wipe = () =>
    Alert.alert('Удалить все данные?', 'Чаты, проекты, статистика, настройки и все ключи будут удалены с телефона. Отменить нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить всё',
        style: 'destructive',
        onPress: async () => {
          await disconnectAll();
          const servers = await repo.listMcpServers();
          const providers = await repo.listProviders();
          for (const p of [...providers.map((x) => x.id), ...CATALOG.map((x) => x.id)]) await setSecret(apiKeyName(p), null);
          for (const sv of servers) await setSecret(mcpSecretName(sv.id), null);
          await setSecret(RELAY_TOKEN, null);
          await repo.wipeAll();
          await settings().load();
          await settings().set('onboarded', false);
          await bootstrapProviders();
          runtime.bumpList();
          router.replace('/onboarding');
        },
      },
    ]);

  return (
    <Screen>
      <Section title="Защита" footer="Блокировка запрашивается при запуске и после минуты в фоне.">
        <Row first icon="finger-print" title="Блокировка биометрией" right={<Toggle value={s.biometricLock} onChange={(v) => void toggleLock(v)} />} />
      </Section>
      <Section title="Данные" footer="Резервная копия не содержит API-ключей и токенов: они хранятся только в защищённом хранилище Android (Keystore).">
        <Row first icon="share-outline" title="Экспорт данных" subtitle="Чаты, проекты, настройки, статистика — в JSON" onPress={() => void doExport()} />
        <Row icon="download-outline" title="Импорт данных" subtitle="Восстановить из резервной копии" onPress={() => void doImport()} />
      </Section>
      <Section>
        <Row first icon="trash-outline" danger title="Удалить все данные" onPress={wipe} />
      </Section>
      <T v="caption">Nexus не собирает телеметрию. Запросы уходят только выбранным вами провайдерам ИИ, MCP-серверам и вашему компьютеру.</T>
    </Screen>
  );
}
