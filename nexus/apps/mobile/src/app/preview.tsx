import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Empty, IconButton } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { getPreview } from '@/store/preview';

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob: https:; media-src data: blob:;">`;

export default function Preview() {
  const { c } = useTheme();
  const p = getPreview();
  const [allowNet, setAllowNet] = useState(false);
  if (!p) return <Empty icon="code-slash-outline" title="Нечего показать" />;
  const html = allowNet ? p.html : /<head[^>]*>/i.test(p.html) ? p.html.replace(/<head[^>]*>/i, (m) => `${m}${CSP}`) : `${CSP}${p.html}`;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: `Превью · ${p.title}`,
          headerRight: () => <IconButton name={allowNet ? 'globe' : 'globe-outline'} label={allowNet ? 'Сеть разрешена' : 'Разрешить сеть'} color={allowNet ? c.accent : c.textMuted} onPress={() => setAllowNet(!allowNet)} />,
        }}
      />
      <WebView
        key={String(allowNet)}
        originWhitelist={['about:blank', 'data:*']}
        source={{ html, baseUrl: 'about:blank' }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('data:') || (allowNet && /^https:/.test(r.url))}
        style={{ flex: 1, backgroundColor: '#fff' }}
      />
    </View>
  );
}
