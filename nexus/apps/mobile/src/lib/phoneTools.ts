import * as Battery from 'expo-battery';
import * as Calendar from 'expo-calendar/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts/legacy';
import * as Device from 'expo-device';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as SMS from 'expo-sms';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Share } from 'react-native';
import type { ToolOutput } from '@nexus/core';
import { checkUrlSecurity } from '@nexus/core';
import { parseDdgHtml, parseDdgLite, type SearchResult } from './ddg';
import { fetchWithTimeout } from './net';

export interface PhoneTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  run: (args: Record<string, unknown>) => Promise<ToolOutput>;
}

const ok = (v: unknown): ToolOutput => ({ content: typeof v === 'string' ? v : JSON.stringify(v, null, 2) });
const fail = (msg: string): ToolOutput => ({ content: msg, isError: true });
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Параметр "${name}" обязателен`);
  return v;
};

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

async function writableCalendarId(): Promise<string> {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = cals.filter((c) => c.allowsModifications);
  const primary = writable.find((c) => c.isPrimary) ?? writable.find((c) => c.source?.isLocalAccount === false) ?? writable[0];
  if (!primary) throw new Error('Нет календаря, доступного для записи');
  return primary.id;
}

export const PHONE_TOOLS: PhoneTool[] = [
  {
    name: 'datetime_now',
    title: 'Дата и время',
    description: 'Текущие дата, время, день недели и часовой пояс телефона.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: async () => {
      const d = new Date();
      return ok({ iso: d.toISOString(), local: d.toLocaleString('ru-RU'), weekday: d.toLocaleDateString('ru-RU', { weekday: 'long' }), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -d.getTimezoneOffset() });
    },
  },
  {
    name: 'device_info',
    title: 'Состояние телефона',
    description: 'Модель телефона, версия Android, заряд батареи, тип сети.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: async () => {
      const [level, state, net] = await Promise.all([Battery.getBatteryLevelAsync().catch(() => -1), Battery.getBatteryStateAsync().catch(() => Battery.BatteryState.UNKNOWN), Network.getNetworkStateAsync().catch(() => null)]);
      return ok({
        device: `${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim(),
        os: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim(),
        batteryPercent: level >= 0 ? Math.round(level * 100) : null,
        charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
        network: net ? { type: net.type, connected: net.isConnected, internet: net.isInternetReachable } : null,
      });
    },
  },
  {
    name: 'location_get',
    title: 'Местоположение',
    description: 'Текущие координаты телефона и приблизительный адрес.',
    inputSchema: { type: 'object', properties: { precise: { type: 'boolean', description: 'Высокая точность (дольше)' } } },
    readOnly: true,
    run: async (a) => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return fail('Нет разрешения на геолокацию');
      const pos = await Location.getCurrentPositionAsync({ accuracy: a.precise ? Location.Accuracy.High : Location.Accuracy.Balanced });
      const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }).catch(() => []);
      const g = geo[0];
      return ok({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
        address: g ? [g.street, g.streetNumber, g.city, g.region, g.country].filter(Boolean).join(', ') : null,
      });
    },
  },
  {
    name: 'contacts_search',
    title: 'Поиск контактов',
    description: 'Найти контакты в телефонной книге по имени. Возвращает телефоны и e-mail.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Имя или часть имени' }, limit: { type: 'integer' } }, required: ['query'] },
    readOnly: true,
    run: async (a) => {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') return fail('Нет разрешения на контакты');
      const { data } = await Contacts.getContactsAsync({ name: str(a.query, 'query'), fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Company], pageSize: Math.min(Number(a.limit) || 10, 50) });
      return ok(
        data.map((c) => ({
          name: c.name,
          company: c.company,
          phones: c.phoneNumbers?.map((p) => `${p.label ? `${p.label}: ` : ''}${p.number}`),
          emails: c.emails?.map((e) => e.email),
        })),
      );
    },
  },
  {
    name: 'calendar_list_events',
    title: 'События календаря',
    description: 'Список событий календаря в диапазоне дат (по умолчанию — ближайшие 7 дней).',
    inputSchema: { type: 'object', properties: { from: { type: 'string', description: 'ISO-дата начала' }, to: { type: 'string', description: 'ISO-дата конца' } } },
    readOnly: true,
    run: async (a) => {
      const perm = await Calendar.requestCalendarPermissionsAsync();
      if (perm.status !== 'granted') return fail('Нет разрешения на календарь');
      const from = typeof a.from === 'string' ? new Date(a.from) : new Date();
      const to = typeof a.to === 'string' ? new Date(a.to) : new Date(from.getTime() + 7 * 86_400_000);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return fail('Некорректные даты');
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const events = await Calendar.getEventsAsync(
        cals.map((c) => c.id),
        from,
        to,
      );
      return ok(
        events
          .sort((x, y) => new Date(x.startDate).getTime() - new Date(y.startDate).getTime())
          .slice(0, 100)
          .map((e) => ({ title: e.title, start: e.startDate, end: e.endDate, allDay: e.allDay, location: e.location || undefined, notes: e.notes?.slice(0, 300) || undefined })),
      );
    },
  },
  {
    name: 'calendar_create_event',
    title: 'Создать событие',
    description: 'Создать событие в основном календаре телефона.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, start: { type: 'string', description: 'ISO дата-время начала' }, end: { type: 'string', description: 'ISO дата-время конца' }, location: { type: 'string' }, notes: { type: 'string' }, allDay: { type: 'boolean' } },
      required: ['title', 'start'],
    },
    readOnly: false,
    run: async (a) => {
      const perm = await Calendar.requestCalendarPermissionsAsync();
      if (perm.status !== 'granted') return fail('Нет разрешения на календарь');
      const start = new Date(str(a.start, 'start'));
      const end = typeof a.end === 'string' ? new Date(a.end) : new Date(start.getTime() + 3_600_000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fail('Некорректные даты');
      const id = await Calendar.createEventAsync(await writableCalendarId(), {
        title: str(a.title, 'title'),
        startDate: start,
        endDate: end,
        allDay: !!a.allDay,
        location: typeof a.location === 'string' ? a.location : undefined,
        notes: typeof a.notes === 'string' ? a.notes : undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return ok({ created: true, id, start: start.toISOString(), end: end.toISOString() });
    },
  },
  {
    name: 'clipboard_read',
    title: 'Прочитать буфер обмена',
    description: 'Текст из буфера обмена телефона.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: async () => ok((await Clipboard.getStringAsync()) || '(буфер пуст)'),
  },
  {
    name: 'clipboard_write',
    title: 'Скопировать в буфер',
    description: 'Записать текст в буфер обмена телефона.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    readOnly: false,
    run: async (a) => {
      await Clipboard.setStringAsync(str(a.text, 'text'));
      return ok('Скопировано');
    },
  },
  {
    name: 'notify_schedule',
    title: 'Напоминание',
    description: 'Показать уведомление-напоминание через заданное число секунд (или в указанное время).',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, in_seconds: { type: 'integer' }, at: { type: 'string', description: 'ISO дата-время' } }, required: ['title'] },
    readOnly: false,
    run: async (a) => {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return fail('Нет разрешения на уведомления');
      let seconds = Number(a.in_seconds);
      if (typeof a.at === 'string') {
        const at = new Date(a.at).getTime();
        if (Number.isNaN(at)) return fail('Некорректное время');
        seconds = Math.round((at - Date.now()) / 1000);
      }
      if (!Number.isFinite(seconds) || seconds < 1) seconds = 1;
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: str(a.title, 'title'), body: typeof a.body === 'string' ? a.body : undefined },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
      });
      return ok({ scheduled: true, id, fireAt: new Date(Date.now() + seconds * 1000).toISOString() });
    },
  },
  {
    name: 'sms_compose',
    title: 'Написать SMS',
    description: 'Открыть окно SMS с готовым текстом. Отправляет сам пользователь.',
    inputSchema: { type: 'object', properties: { phone: { type: 'string' }, text: { type: 'string' } }, required: ['phone', 'text'] },
    readOnly: false,
    run: async (a) => {
      if (!(await SMS.isAvailableAsync())) return fail('SMS недоступны на этом устройстве');
      const r = await SMS.sendSMSAsync([str(a.phone, 'phone')], str(a.text, 'text'));
      return ok({ result: r.result });
    },
  },
  {
    name: 'call_dial',
    title: 'Позвонить',
    description: 'Открыть номеронабиратель с номером. Звонит сам пользователь.',
    inputSchema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
    readOnly: false,
    run: async (a) => {
      await Linking.openURL(`tel:${str(a.phone, 'phone').replace(/[^\d+*#]/g, '')}`);
      return ok('Номеронабиратель открыт');
    },
  },
  {
    name: 'email_compose',
    title: 'Написать письмо',
    description: 'Открыть почтовый клиент с черновиком письма.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] },
    readOnly: false,
    run: async (a) => {
      if (!(await MailComposer.isAvailableAsync())) {
        const url = `mailto:${encodeURIComponent(String(a.to ?? ''))}?subject=${encodeURIComponent(String(a.subject))}&body=${encodeURIComponent(String(a.body))}`;
        await Linking.openURL(url);
        return ok('Открыт почтовый клиент');
      }
      const r = await MailComposer.composeAsync({ recipients: typeof a.to === 'string' && a.to ? a.to.split(/[;,]\s*/) : [], subject: String(a.subject), body: String(a.body) });
      return ok({ status: r.status });
    },
  },
  {
    name: 'open_url',
    title: 'Открыть ссылку',
    description: 'Открыть веб-страницу во встроенном браузере.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    readOnly: false,
    run: async (a) => {
      const url = str(a.url, 'url');
      if (!/^https?:\/\//i.test(url)) return fail('Поддерживаются только http(s) ссылки');
      await WebBrowser.openBrowserAsync(url);
      return ok('Открыто');
    },
  },
  {
    name: 'web_fetch',
    title: 'Загрузить страницу',
    description: 'Скачать веб-страницу и вернуть её текст (без HTML).',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, max_chars: { type: 'integer' } }, required: ['url'] },
    readOnly: true,
    run: async (a) => {
      const url = str(a.url, 'url');
      const sec = checkUrlSecurity(url);
      if (sec && !/^https?:\/\//i.test(url)) return fail(sec);
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Android) Nexus/1.0', Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' } }, 20_000);
      const type = res.headers.get('content-type') ?? '';
      const body = await res.text();
      const text = /html/i.test(type) ? htmlToText(body) : body;
      const max = Math.min(Math.max(Number(a.max_chars) || 20_000, 500), 100_000);
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim();
      return { content: `${title ? `# ${title}\n` : ''}HTTP ${res.status} ${url}\n\n${text.slice(0, max)}${text.length > max ? '\n…[обрезано]' : ''}`, isError: !res.ok };
    },
  },
  {
    name: 'web_search',
    title: 'Поиск в интернете',
    description: 'Поиск в интернете (DuckDuckGo). Возвращает заголовки, ссылки и фрагменты. Для подробностей открой нужную ссылку через web_fetch.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer' }, region: { type: 'string', description: 'Например ru-ru, us-en' } }, required: ['query'] },
    readOnly: true,
    run: async (a) => {
      const query = str(a.query, 'query');
      const max = Math.min(Math.max(Number(a.max_results) || 8, 1), 20);
      const results = await searchWeb(query, max, typeof a.region === 'string' ? a.region : undefined);
      if (!results.length) return { content: `Ничего не найдено по запросу «${query}»` };
      return ok(results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n'));
    },
  },
  {
    name: 'camera_take_photo',
    title: 'Сделать фото',
    description: 'Открыть камеру, пользователь делает снимок; изображение возвращается модели.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: false,
    run: async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return fail('Нет разрешения на камеру');
      const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, exif: false });
      if (r.canceled || !r.assets[0]?.base64) return fail('Съёмка отменена');
      return { content: 'Фото сделано', images: [{ mediaType: r.assets[0].mimeType ?? 'image/jpeg', data: r.assets[0].base64 }] };
    },
  },
  {
    name: 'files_pick',
    title: 'Выбрать файл',
    description: 'Пользователь выбирает файл на телефоне; текстовые файлы возвращаются содержимым.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: async () => {
      const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets[0]) return fail('Выбор отменён');
      const asset = r.assets[0];
      const f = new File(asset.uri);
      const isText = /^text\/|json|xml|csv|javascript|markdown|yaml/.test(asset.mimeType ?? '') || /\.(txt|md|csv|json|xml|ya?ml|log|js|ts|py|html?|css)$/i.test(asset.name);
      if (!isText) return ok({ name: asset.name, size: asset.size, mimeType: asset.mimeType, note: 'Бинарный файл — содержимое не передано' });
      if ((asset.size ?? 0) > 1_000_000) return fail('Файл больше 1 МБ');
      return { content: `Файл ${asset.name}:\n\n${await f.text()}` };
    },
  },
  {
    name: 'share_text',
    title: 'Поделиться',
    description: 'Открыть системное меню «Поделиться» с текстом.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    readOnly: false,
    run: async (a) => {
      const r = await Share.share({ message: str(a.text, 'text') });
      return ok({ action: r.action });
    },
  },
];

export async function searchWeb(query: string, max: number, region?: string): Promise<SearchResult[]> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' };
  const body = `q=${encodeURIComponent(query)}${region ? `&kl=${encodeURIComponent(region)}` : ''}`;
  try {
    const res = await fetchWithTimeout('https://html.duckduckgo.com/html/', { method: 'POST', headers, body }, 15_000);
    if (res.ok) {
      const r = parseDdgHtml(await res.text(), max);
      if (r.length) return r;
    }
  } catch {
    // fall through to the lite endpoint
  }
  const res = await fetchWithTimeout(`https://lite.duckduckgo.com/lite/?${body}`, { headers: { 'User-Agent': headers['User-Agent'] } }, 15_000);
  if (!res.ok) throw new Error(`Поиск недоступен: HTTP ${res.status}`);
  return parseDdgLite(await res.text(), max);
}

/** Read-only tools that run without asking unless the user changes it. */
export const SAFE_BY_DEFAULT = new Set(['datetime_now', 'device_info', 'web_search', 'web_fetch']);

export function phoneTool(name: string): PhoneTool | undefined {
  return PHONE_TOOLS.find((t) => t.name === name);
}
