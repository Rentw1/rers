import { router, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Empty, Loading } from '@/components/ui';
import { handleIncomingLink } from '@/lib/links';
import { useTheme } from '@/lib/theme';

export default function Pair() {
  const { c } = useTheme();
  const { d } = useGlobalSearchParams<{ d?: string }>();
  const [failure, setError] = useState<string | null>(null);
  const error = d ? failure : 'В ссылке нет данных сопряжения';
  useEffect(() => {
    if (!d) return;
    handleIncomingLink(`nexus://pair?d=${d}`, 'relay').catch((e: Error) => setError(e.message));
  }, [d]);
  if (!error) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
      <Empty icon="desktop-outline" title="Не удалось подключиться" text={error}>
        <Button title="Сканировать снова" onPress={() => router.replace('/scan?mode=relay')} />
      </Empty>
    </View>
  );
}
