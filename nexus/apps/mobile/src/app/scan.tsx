import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Empty, T } from '@/components/ui';
import { handleIncomingLink } from '@/lib/links';
import { useTheme } from '@/lib/theme';

export default function Scan() {
  const { c } = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: 'relay' | 'mcp' }>();
  const [perm, request] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  if (!perm) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        <Empty icon="camera-outline" title="Нужен доступ к камере" text="Камера используется только для сканирования QR-кодов.">
          <Button title="Разрешить" onPress={() => void request()} />
        </Empty>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          busy
            ? undefined
            : async ({ data }) => {
                if (handled.current) return;
                handled.current = true;
                setBusy(true);
                try {
                  const done = await handleIncomingLink(data, mode);
                  if (!done) throw new Error(mode === 'relay' ? 'Это не QR-код Nexus Relay' : 'QR-код не распознан как ссылка Nexus или адрес MCP-сервера');
                } catch (e) {
                  Alert.alert('Не получилось', (e as Error).message, [{ text: 'Ещё раз', onPress: () => ((handled.current = false), setBusy(false)) }, { text: 'Закрыть', onPress: () => router.back() }]);
                }
              }
        }
      />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 48, alignItems: 'center' }}>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
          <T color="#fff">{busy ? 'Подключение…' : mode === 'relay' ? 'Наведите на QR-код в окне Nexus Relay' : 'Наведите на QR-код'}</T>
        </View>
      </View>
    </View>
  );
}
