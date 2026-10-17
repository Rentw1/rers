import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { settings } from '@/store/settings';

/** Dictation into a text field: interim results are shown live, final segments accumulate. */
export function useVoiceInput(getText: () => string, setText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const base = useRef('');
  const committed = useRef('');

  const join = (...parts: string[]) => parts.filter((p) => p.trim()).join(' ').replace(/\s+/g, ' ');

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      committed.current = join(committed.current, t);
      setText(join(base.current, committed.current));
    } else setText(join(base.current, committed.current, t));
  });
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    if (e.error === 'aborted' || e.error === 'no-speech' || e.error === 'speech-timeout') return;
    if (e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
      Alert.alert('Распознавание речи недоступно', 'Установите или обновите приложение Google и включите голосовой ввод.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть Google Play', onPress: () => void Linking.openURL('market://details?id=com.google.android.googlequicksearchbox') },
      ]);
      return;
    }
    Alert.alert('Голосовой ввод', e.message || e.error);
  });

  const start = async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа к микрофону', 'Разрешите доступ к микрофону в настройках Android.');
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      Alert.alert('Распознавание речи недоступно', 'На телефоне нет службы распознавания речи (обычно её даёт приложение Google).');
      return;
    }
    base.current = getText();
    committed.current = '';
    ExpoSpeechRecognitionModule.start({
      lang: settings().language === 'en' ? 'en-US' : 'ru-RU',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      maxAlternatives: 1,
    });
  };

  const stop = () => ExpoSpeechRecognitionModule.stop();

  return { listening, toggle: () => (listening ? stop() : void start()), stop };
}
