import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useWindowDimensions } from 'react-native';
import { ChatDrawer } from '@/components/ChatDrawer';
import { useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings';

export default function MainLayout() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const onboarded = useSettings((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  const wide = width >= 720;
  return (
    <Drawer
      drawerContent={(props) => <ChatDrawer close={() => props.navigation.closeDrawer()} />}
      screenOptions={{
        headerShown: false,
        drawerType: wide ? 'permanent' : 'front',
        drawerStyle: { width: wide ? 320 : Math.min(width * 0.85, 340), backgroundColor: c.surface },
        overlayColor: c.overlay,
        swipeEdgeWidth: 60,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Drawer.Screen name="index" />
      <Drawer.Screen name="chat/[id]" />
    </Drawer>
  );
}
