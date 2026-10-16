import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { fileSize } from '@/lib/format';
import { checkForUpdate, currentVersion, downloadAndInstall, type UpdateInfo } from '@/lib/updates';
import { useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings';

export default function Updates() {
  const { c } = useTheme();
  const auto = useSettings((s) => s.autoUpdateCheck);
  const set = useSettings((s) => s.set);
  const [checking, setChecking] = useState(true);
  const [update, setUpdate] = useState<UpdateInfo | null | undefined>(undefined);
  const [progress, setProgress] = useState<number | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      setUpdate(await checkForUpdate());
      await set('updateCheckedAt', Date.now());
    } catch (e) {
      Alert.alert('Не удалось проверить', (e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkForUpdate()
      .then((u) => {
        setUpdate(u);
        void set('updateCheckedAt', Date.now());
      })
      .catch(() => setUpdate(undefined))
      .finally(() => setChecking(false));
  }, [set]);

  return (
    <Screen>
      <Section>
        <Row first icon="information-circle-outline" title="Установлена версия" right={<T style={{ fontWeight: '600' }}>{currentVersion()}</T>} />
        <Row title="Проверять обновления автоматически" right={<Toggle value={auto} onChange={(v) => void set('autoUpdateCheck', v)} />} />
      </Section>
      <Button icon="refresh" kind="secondary" title="Проверить обновления" loading={checking} onPress={() => void check()} />
      {update === null ? (
        <T v="small" style={{ textAlign: 'center', marginTop: 16 }}>
          У вас последняя версия.
        </T>
      ) : null}
      {update ? (
        <View style={{ marginTop: 18, gap: 10 }}>
          <T v="h2">Доступна версия {update.version}</T>
          <T v="caption">
            {update.assetName} · {fileSize(update.size)}
            {update.sha256 ? ' · проверка SHA-256' : ''}
          </T>
          {update.notes ? (
            <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border }}>
              <Markdown text={update.notes} compact />
            </View>
          ) : null}
          {progress !== null ? (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }}>
              <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: c.accent }} />
            </View>
          ) : null}
          <Button
            icon="cloud-download-outline"
            title={progress !== null ? `Загрузка ${Math.round(progress * 100)}%` : 'Скачать и установить'}
            disabled={progress !== null}
            onPress={async () => {
              setProgress(0);
              try {
                await downloadAndInstall(update, setProgress);
              } catch (e) {
                Alert.alert('Ошибка обновления', (e as Error).message);
              } finally {
                setProgress(null);
              }
            }}
          />
          <Button kind="ghost" title="Открыть страницу релиза" onPress={() => void WebBrowser.openBrowserAsync(update.pageUrl)} />
          <T v="caption">При первой установке Android попросит разрешить установку из этого приложения. Данные и ключи сохраняются при обновлении.</T>
        </View>
      ) : null}
    </Screen>
  );
}
