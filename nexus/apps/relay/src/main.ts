import qrcodeTerminal from 'qrcode-terminal';
import { encodePairingUri } from '@nexus/core';
import { BuiltinTools } from './builtin';
import { CONFIG_PATH, claudeDesktopConfigPath, importClaudeDesktop, loadConfig, saveConfig } from './config';
import { DeviceStore } from './devices';
import { createRelayServer, pairingPayload, RELAY_VERSION } from './server';
import { ServerManager } from './servers';
import { SyncStore } from './sync';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

if (has('--help') || has('-h')) {
  console.log(`Nexus Relay ${RELAY_VERSION} — мост между телефоном и компьютером

Использование: nexus-relay [опции]
  --port <n>         порт (по умолчанию из config.json, 4545)
  --import-claude    импортировать MCP-серверы из Claude Desktop (${claudeDesktopConfigPath()})
  --allow-dir <path> добавить разрешённую папку
  --enable-shell     разрешить выполнение команд (pc_shell_exec)
  --version          версия

Конфигурация: ${CONFIG_PATH}`);
  process.exit(0);
}
if (has('--version')) {
  console.log(RELAY_VERSION);
  process.exit(0);
}

const log = (m: string) => console.log(`${new Date().toLocaleTimeString()} ${m}`);

async function main(): Promise<void> {
  const cfg = loadConfig();
  let changed = false;
  if (opt('--port')) {
    cfg.port = Number(opt('--port'));
    changed = true;
  }
  const dir = opt('--allow-dir');
  if (dir && !cfg.allowedDirs.includes(dir)) {
    cfg.allowedDirs.push(dir);
    changed = true;
  }
  if (has('--enable-shell') && !cfg.shell.enabled) {
    cfg.shell.enabled = true;
    changed = true;
  }
  if (has('--import-claude')) {
    const added = importClaudeDesktop(cfg);
    log(added.length ? `Импортированы серверы: ${added.join(', ')}` : 'Новых серверов в конфиге Claude Desktop не найдено');
    changed ||= added.length > 0;
  }
  if (changed) saveConfig(cfg);

  const devices = new DeviceStore();
  const servers = new ServerManager(log);
  const builtin = new BuiltinTools(cfg);
  const sync = new SyncStore();
  const server = createRelayServer({ cfg, devices, servers, builtin, sync, log });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, () => resolve());
  });
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  const payload = pairingPayload({ cfg, devices, servers, builtin, sync, log });
  console.log(`\n  Nexus Relay ${RELAY_VERSION} — «${cfg.name}»`);
  console.log(`  Панель:   http://localhost:${cfg.port}`);
  console.log(`  Адреса:   ${payload.urls.join('  ')}`);
  console.log(`  Конфиг:   ${CONFIG_PATH}\n`);
  console.log('  Отсканируйте QR в приложении Nexus (Настройки → Компьютер):\n');
  qrcodeTerminal.generate(encodePairingUri(payload), { small: true }, (q: string) => console.log(q));
  console.log('  Код действует 10 минут. Новый код — в панели.\n');

  void servers.start(cfg.mcpServers);

  const shutdown = async (sig: string) => {
    log(`Остановка (${sig})…`);
    server.close();
    sync.flush();
    await servers.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e: Error & { code?: string }) => {
  if (e.code === 'EADDRINUSE') console.error('Порт занят. Укажите другой: nexus-relay --port 4546');
  else console.error(e.message);
  process.exit(1);
});
