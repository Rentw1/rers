import { router, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Empty, Loading } from '@/components/ui';
import { handleIncomingLink } from '@/lib/links';
import { useTheme } from '@/lib/theme';

export default function McpAddLink() {
  const { c } = useTheme();
  const { config } = useGlobalSearchParams<{ config?: string }>();
  const [failure, setError] = useState<string | null>(null);
  const error = config ? failure : 'В ссылке нет конфигурации';
  useEffect(() => {
    if (!config) return;
    handleIncomingLink(`nexus://mcp/add?config=${config}`, 'mcp').catch((e: Error) => setError(e.message));
  }, [config]);
  if (!error) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
      <Empty icon="server-outline" title="Не удалось добавить сервер" text={error}>
        <Button title="К списку серверов" onPress={() => router.replace('/settings/mcp')} />
      </Empty>
    </View>
  );
}
