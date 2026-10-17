import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Row, Screen, Section, T } from '@/components/ui';
import { money, startOfDay, startOfMonth } from '@/lib/format';
import { getRelay } from '@/lib/relay';
import * as repo from '@/lib/repo';
import { currentVersion } from '@/lib/updates';
import { useSettings } from '@/store/settings';

export default function SettingsHome() {
  const [info, setInfo] = useState({ providers: 0, servers: 0, relay: '', today: 0, month: 0 });
  const language = useSettings((s) => s.language);
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [providers, servers, relay, today, month] = await Promise.all([repo.listProviders(), repo.listMcpServers(), getRelay(), repo.usageTotals(startOfDay()), repo.usageTotals(startOfMonth())]);
        setInfo({ providers: providers.filter((p) => p.enabled).length, servers: servers.filter((s) => s.enabled && s.authType !== 'relay').length, relay: relay?.name ?? '', today: today.costMicro, month: month.costMicro });
      })();
    }, []),
  );
  return (
    <Screen>
      <Section title="ИИ">
        <Row first icon="key-outline" title="Провайдеры ИИ" subtitle={`Подключено: ${info.providers}`} chevron onPress={() => router.push('/settings/providers')} />
        <Row icon="chatbubble-ellipses-outline" title="Чат и модели" subtitle="Модель по умолчанию, инструкции, параметры" chevron onPress={() => router.push('/settings/chat')} />
        <Row icon="folder-outline" title="Проекты" chevron onPress={() => router.push('/settings/projects')} />
      </Section>
      <Section title="Инструменты">
        <Row first icon="construct-outline" title="Инструменты (MCP)" subtitle={`Телефон + серверов: ${info.servers}`} chevron onPress={() => router.push('/settings/mcp')} />
        <Row icon="desktop-outline" title="Компьютер" subtitle={info.relay ? `Подключён: ${info.relay}` : 'Не подключён — Nexus Relay'} chevron onPress={() => router.push('/settings/relay')} />
      </Section>
      <Section title="Деньги">
        <Row first icon="stats-chart-outline" title="Расход" subtitle={`Сегодня ${money(info.today)} · месяц ${money(info.month)}`} chevron onPress={() => router.push('/settings/usage')} />
        <Row icon="wallet-outline" title="Бюджеты" chevron onPress={() => router.push('/settings/budgets')} />
        <Row icon="pricetags-outline" title="Цены моделей" chevron onPress={() => router.push('/settings/pricing')} />
      </Section>
      <Section title="Приложение">
        <Row first icon="color-palette-outline" title="Внешний вид" subtitle={language === 'en' ? 'English' : 'Русский'} chevron onPress={() => router.push('/settings/appearance')} />
        <Row icon="shield-checkmark-outline" title="Приватность и данные" chevron onPress={() => router.push('/settings/privacy')} />
        <Row icon="cloud-download-outline" title="Обновления" subtitle={`Версия ${currentVersion()}`} chevron onPress={() => router.push('/settings/updates')} />
      </Section>
      <T v="caption" style={{ textAlign: 'center' }}>
        Nexus {currentVersion()} · ключи хранятся только на устройстве
      </T>
    </Screen>
  );
}
