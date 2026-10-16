# Nexus Relay

Программа для ПК, которая открывает телефону доступ к компьютеру.

## Запуск

```bash
node nexus-relay.mjs [--port 4545] [--import-claude] [--allow-dir <путь>] [--enable-shell]
```

- Панель управления: http://localhost:4545. Открывается только на самом ПК: там QR-код сопряжения, устройства (можно отозвать доступ), MCP-серверы (статус, перезапуск) и синхронизированные чаты.
- QR-код одноразовый и действует 10 минут.

## `~/.nexus-relay/config.json`

```json
{
  "name": "Мой ПК",
  "port": 4545,
  "host": "0.0.0.0",
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/me/Projects"] },
    "git": { "command": "uvx", "args": ["mcp-server-git"] },
    "remote": { "url": "https://example.com/mcp", "headers": { "Authorization": "Bearer …" } }
  },
  "allowedDirs": ["/home/me/Nexus"],
  "shell": { "enabled": false, "allow": ["git", "node", "python", "ls"], "timeoutMs": 60000 },
  "inboxDir": "/home/me/Nexus/inbox"
}
```

Формат `mcpServers` совпадает с Claude Desktop: опция `--import-claude` переносит серверы автоматически.

## Встроенные инструменты

| Инструмент | Что делает |
|---|---|
| `pc_system_info` | ОС, CPU, память, разрешённые папки |
| `pc_list_dir`, `pc_read_file`, `pc_write_file` | Файлы **только** внутри `allowedDirs` (символьные ссылки разрешаются и проверяются) |
| `pc_clipboard_get`, `pc_clipboard_set` | Буфер обмена (Windows, macOS, Linux с xclip или wl-clipboard) |
| `pc_open` | Открыть ссылку или файл в программе по умолчанию |
| `pc_shell_exec` | Только при `shell.enabled`. Без оболочки (без пайпов и подстановок), только команды из `shell.allow`, с таймаутом |

Инструменты MCP-серверов видны на телефоне как `<сервер>__<инструмент>`.

## HTTP API

| Метод | Путь | Доступ |
|---|---|---|
| `POST` | `/api/pair` | одноразовый код из QR → токен устройства (не больше 10 попыток в минуту) |
| `GET` | `/api/info` | Bearer-токен устройства |
| `POST` | `/mcp` | MCP Streamable HTTP (JSON-RPC: `initialize`, `tools/list`, `tools/call`, `ping`, `notifications/cancelled`) |
| `POST` | `/api/sync` | синхронизация чатов по принципу «последняя запись побеждает» |
| `POST` | `/api/files?name=…` | загрузка файла в `inboxDir` с проверкой заголовка `x-sha256` (до 200 МБ) |
| `GET` | `/`, `/api/panel*` | только с этого ПК |

## Безопасность

- Токен устройства — 256 случайных бит. На ПК хранится только scrypt-хеш (`~/.nexus-relay/devices.json`, права 600).
- После 30 неудачных попыток авторизации за минуту адрес временно блокируется.
- В открытый интернет порт не пробрасывайте: используйте Tailscale или локальную сеть.
