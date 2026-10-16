import type { ConfigContext, ExpoConfig } from 'expo/config';
import pkg from './package.json';

const versionName = process.env.NEXUS_VERSION_NAME || pkg.version;
const versionCode = Number(process.env.NEXUS_VERSION_CODE || 1);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nexus',
  slug: 'nexus',
  scheme: 'nexus',
  version: versionName,
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F5F1EA',
  platforms: ['android', 'ios'],
  android: {
    package: 'app.nexus.ai',
    versionCode,
    adaptiveIcon: {
      backgroundColor: '#C96442',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.CAMERA',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_CALENDAR',
      'android.permission.WRITE_CALENDAR',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.USE_BIOMETRIC',
      'android.permission.REQUEST_INSTALL_PACKAGES',
      'android.permission.READ_MEDIA_IMAGES',
    ],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.WRITE_CONTACTS'],
  },
  ios: {
    bundleIdentifier: 'app.nexus.ai',
    supportsTablet: true,
  },
  experiments: { typedRoutes: false },
  extra: {
    updateRepo: process.env.NEXUS_UPDATE_REPO || 'Rentw1/rers',
    releaseTagPrefix: 'nexus-v',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#F5F1EA', dark: { image: './assets/splash-icon.png', backgroundColor: '#262624' } }],
    ['expo-camera', { cameraPermission: 'Камера нужна для сканирования QR-кодов и фото в чат.', recordAudioAndroid: false }],
    ['expo-contacts', { contactsPermission: 'ИИ может искать контакты, когда вы это разрешите.' }],
    ['expo-calendar', { calendarPermission: 'ИИ может читать и создавать события календаря по вашему запросу.' }],
    ['expo-location', { locationWhenInUsePermission: 'ИИ может узнать ваше местоположение по вашему запросу.' }],
    ['expo-image-picker', { photosPermission: 'Выбор фото для отправки в чат.', cameraPermission: 'Съёмка фото для отправки в чат.' }],
    ['expo-local-authentication', { faceIDPermission: 'Блокировка приложения биометрией.' }],
    ['expo-notifications', { color: '#C96442' }],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          usesCleartextTraffic: true,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          buildArchs: ['arm64-v8a', 'armeabi-v7a'],
        },
      },
    ],
    './plugins/withAndroidRelease',
  ],
});
