import { execFileSync } from 'node:child_process';
import { hostname, homedir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow, Menu, Notification, app, nativeTheme, safeStorage, shell } from 'electron';
import type { ApprovalRequest, ChatEvent } from '../shared/types';
import { Engine } from './engine';
import { registerIpc } from './ipc';
import { Providers } from './providers';
import { RelayHost } from './relayHost';
import { Store } from './store';
import { ToolHub } from './tools';

if (!app.requestSingleInstanceLock()) app.quit();

/** GUI apps on macOS/Linux start without the login shell PATH, so `npx`/`uvx` for MCP servers would not be found. */
function fixPath(): void {
  if (process.platform === 'win32') return;
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', join(homedir(), '.local', 'bin'), join(homedir(), '.cargo', 'bin')];
  let shellPath = '';
  try {
    const out = execFileSync(process.env.SHELL || '/bin/bash', ['-ilc', 'printf "__NEXUS_PATH__%s" "$PATH"'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
    shellPath = out.split('__NEXUS_PATH__')[1]?.trim() ?? '';
  } catch {
    // fall back to the well-known directories
  }
  const parts = [...shellPath.split(':'), ...(process.env.PATH ?? '').split(':'), ...extra].filter(Boolean);
  process.env.PATH = [...new Set(parts)].join(':');
}
fixPath();

let win: BrowserWindow | null = null;
const log = (m: string) => console.log(`[nexus] ${m}`);

function send(channel: 'chat:event' | 'approval:request' | 'app:command', payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow(store: Store): BrowserWindow {
  const s = store.settings.get();
  const dark = s.theme === 'dark' || (s.theme === 'system' && nativeTheme.shouldUseDarkColors);
  const w = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'Nexus',
    backgroundColor: dark ? '#262624' : '#F5F1EA',
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  w.once('ready-to-show', () => w.show());
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith(process.env.NEXUS_DEV_URL ?? '\u0000')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  if (process.env.NEXUS_DEV_URL) void w.loadURL(process.env.NEXUS_DEV_URL);
  else void w.loadFile(join(__dirname, 'renderer', 'index.html'));
  return w;
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'Файл',
        submenu: [
          { label: 'Новый чат', accelerator: 'CmdOrCtrl+N', registerAccelerator: false, click: () => send('app:command', 'new-chat') },
          { label: 'Поиск по чатам', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: () => send('app:command', 'search') },
          { label: 'Настройки', accelerator: 'CmdOrCtrl+,', registerAccelerator: false, click: () => send('app:command', 'settings') },
          { type: 'separator' },
          isMac ? { role: 'close' as const } : { role: 'quit' as const, label: 'Выход' },
        ],
      },
      { label: 'Правка', role: 'editMenu' as const },
      {
        label: 'Вид',
        submenu: [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' }, { role: 'resetZoom' as const }, { role: 'zoomIn' as const }, { role: 'zoomOut' as const }, { type: 'separator' }, { role: 'togglefullscreen' as const }],
      },
    ]),
  );
}

app.setAppUserModelId('app.nexus.desktop');

void app.whenReady().then(async () => {
  const dataDir = process.env.NEXUS_DATA_DIR ?? join(app.getPath('userData'), 'data');
  const store = new Store(dataDir, homedir());
  const secrets = {
    encrypt: (plain: string) => (safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(plain).toString('base64')}` : `plain:${Buffer.from(plain).toString('base64')}`),
    decrypt: (v: string) => (v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : Buffer.from(v.replace(/^plain:/, ''), 'base64').toString('utf8')),
  };
  const providers = new Providers(store, secrets);
  const tools = new ToolHub(store, hostname(), (r: ApprovalRequest) => {
    send('approval:request', r);
    if (win && !win.isFocused() && Notification.isSupported()) new Notification({ title: 'Nexus ждёт разрешения', body: `${r.serverName}: ${r.toolTitle}` }).show();
  }, log);
  const engine = new Engine(store, providers, tools, {
    emit: (ev: ChatEvent) => send('chat:event', ev),
    notifyDone: (chat, preview) => {
      if (win && !win.isFocused() && Notification.isSupported()) {
        const n = new Notification({ title: chat.title, body: preview || 'Ответ готов' });
        n.on('click', () => {
          win?.show();
          win?.focus();
          send('app:command', `open-chat:${chat.id}`);
        });
        n.show();
      }
    },
  });
  const relay = new RelayHost(store, tools, hostname(), log);

  registerIpc({ store, providers, tools, engine, relay, win: () => win });
  buildMenu();
  win = createWindow(store);

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) win = createWindow(store);
  });

  void tools.start().then(() => send('chat:event', { chatId: null, kind: 'list' }));
  void relay.apply();
  const s = store.settings.get();
  if (Date.now() - s.pricesSyncedAt > 86_400_000) void providers.syncOpenRouterPrices().catch(() => undefined);
  if (!s.fx || Date.now() - s.fx.updatedAt > 86_400_000) void providers.syncFx().catch(() => undefined);

  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    store.flushAll();
    void Promise.allSettled([tools.stop(), relay.stop()]).finally(() => app.exit(0));
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
