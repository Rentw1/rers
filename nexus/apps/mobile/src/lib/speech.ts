import * as Speech from 'expo-speech';
import { settings } from '@/store/settings';

/** Converts Markdown into plain prose suitable for text-to-speech. */
export function speakableText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (фрагмент кода пропущен) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|?[-:\s|]+\|?\s*$/gm, '')
    .replace(/[*_~>|#]+/g, ' ')
    .replace(/https?:\/\/\S+/g, 'ссылка')
    .replace(/\s+/g, ' ')
    .trim();
}

let current: string | null = null;

export function speaking(): string | null {
  return current;
}

/** Speaks `text`; calling again with the same key stops. `onChange` reports the active key. */
export function toggleSpeak(key: string, text: string, onChange: (key: string | null) => void): void {
  if (current === key) {
    void Speech.stop();
    current = null;
    onChange(null);
    return;
  }
  void Speech.stop();
  current = key;
  onChange(key);
  const done = () => {
    if (current === key) {
      current = null;
      onChange(null);
    }
  };
  const s = settings();
  Speech.speak(speakableText(text).slice(0, 3900), {
    language: s.language === 'en' ? 'en-US' : 'ru-RU',
    rate: s.ttsRate,
    onDone: done,
    onStopped: done,
    onError: done,
  });
}
