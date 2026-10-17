# Nexus — ИИ-ассистент для Android

Мобильный AI-чат с интерфейсом в духе приложения Claude:

- **DeepSeek по умолчанию**, плюс OpenAI, Claude (Anthropic), Gemini, OpenRouter, Groq, Mistral, xAI (Grok), Qwen, Kimi, Together, Perplexity, локальные Ollama и LM Studio, а также любой OpenAI-совместимый адрес.
- **MCP на телефоне**: удалённые MCP-серверы (Streamable HTTP или SSE, токен или OAuth) и встроенные инструменты телефона: веб-поиск, загрузка веб-страниц, контакты, календарь, геолокация, файлы, камера, буфер обмена, напоминания, SMS, звонок, почта.
- **Связь с компьютером** через **Nexus Relay**: ИИ получает доступ к файлам в выбранных папках ПК и к буферу обмена, локальные MCP-серверы (как в Claude Desktop) запускаются на ПК, чаты синхронизируются, файлы передаются на ПК.
- **Цены и расход**: стоимость каждого ответа и чата, статистика по дням, провайдерам и моделям, балансы DeepSeek и OpenRouter, бюджеты с уведомлениями, экспорт в CSV, валюты USD, RUB и EUR.
- Голосовой ввод и озвучка ответов, веб-поиск без ключей, автоматическая подгонка истории под контекст модели, кнопка «Продолжить» для обрезанных ответов, экспорт чата в Markdown, уведомление о готовом ответе.
- Проекты (инструкции, файлы-знания, модель, набор инструментов), ветвление ответов, правка сообщений, превью HTML/SVG, тёмная тема, блокировка биометрией, резервные копии, самообновление из GitHub Releases.

---

## Установка на телефон

1. Откройте на телефоне страницу **[Releases](https://github.com/Rentw1/rers/releases)** и скачайте `nexus-<версия>-arm64-v8a.apk`. Это вариант почти для всех телефонов; для очень старых нужен `armeabi-v7a`, а если не уверены — берите `universal`.
2. Откройте скачанный файл. Android спросит, разрешить ли установку из браузера или файлового менеджера: разрешите.
3. Запустите Nexus и вставьте API-ключ DeepSeek.

Минимальная версия — **Android 8.0**. Новые версии приложение находит и ставит само: Настройки → Обновления. Данные и ключи при обновлении сохраняются.

Каждый пуш в репозиторий автоматически собирает APK и публикует новый релиз `nexus-v1.0.<номер сборки>`.

### Где взять ключи

| Провайдер | Получить ключ | Цены |
|---|---|---|
| DeepSeek | https://platform.deepseek.com/api_keys | https://api-docs.deepseek.com/quick_start/pricing |
| OpenAI | https://platform.openai.com/api-keys | https://openai.com/api/pricing |
| Anthropic (Claude) | https://console.anthropic.com/settings/keys | https://www.anthropic.com/pricing#api |
| Google Gemini | https://aistudio.google.com/apikey | https://ai.google.dev/gemini-api/docs/pricing |
| OpenRouter | https://openrouter.ai/settings/keys | https://openrouter.ai/models |
| Groq | https://console.groq.com/keys | https://groq.com/pricing |
| Mistral | https://console.mistral.ai/api-keys | https://mistral.ai/pricing |
| xAI | https://console.x.ai | https://docs.x.ai/docs/models |
| Qwen | https://bailian.console.alibabacloud.com/?apiKey=1 | https://www.alibabacloud.com/help/en/model-studio/models |
| Moonshot (Kimi) | https://platform.moonshot.ai/console/api-keys | https://platform.moonshot.ai/docs/pricing |
| Together | https://api.together.ai/settings/api-keys | https://www.together.ai/pricing |
| Perplexity | https://www.perplexity.ai/settings/api | https://docs.perplexity.ai/guides/pricing |
| Ollama | ключ не нужен, https://ollama.com/download | бесплатно |
| LM Studio | ключ не нужен, https://lmstudio.ai | бесплатно |

Те же ссылки есть внутри приложения: Настройки → Провайдеры ИИ → нужный провайдер.

## Подключение компьютера (Nexus Relay)

1. Установите **Node.js 20+**: https://nodejs.org.
2. Скачайте `nexus-relay.mjs` из Releases (или соберите сами: `pnpm --filter @nexus/relay build`).
3. Запустите `node nexus-relay.mjs`. В терминале появится QR-код, он же есть на странице http://localhost:4545.
4. В телефоне откройте Настройки → Компьютер → **Сканировать QR**.

Телефон и ПК должны быть в одной сети Wi-Fi. Чтобы подключаться откуда угодно, да ещё и с шифрованием, поставьте **[Tailscale](https://tailscale.com/download)** на оба устройства. Relay сам добавит Tailscale-адрес в QR-код.

Полезные опции:

```bash
node nexus-relay.mjs --import-claude          # взять MCP-серверы из конфигурации Claude Desktop
node nexus-relay.mjs --allow-dir ~/Documents  # разрешить ИИ доступ к папке
node nexus-relay.mjs --enable-shell           # разрешить команды из белого списка
```

Настройки хранятся в `~/.nexus-relay/config.json`. Подробности — в [docs/RELAY.md](docs/RELAY.md).

## MCP-серверы на телефоне

Настройки → Инструменты (MCP):

- **Добавить сервер** — по URL, с авторизацией токеном, заголовками или OAuth (страница входа откроется в браузере);
- **Сканировать QR** — QR со ссылкой `https://…/mcp` или `nexus://mcp/add?config=…`;
- **Импорт JSON** — конфигурация в формате Claude Desktop или Cursor (`{"mcpServers": {...}}`). Локальные stdio-серверы из неё телефон предложит запускать через Relay.

Каждый вызов инструмента подтверждается: «Разрешить», «Всегда» или «Отклонить». Отдельные инструменты можно выключить.

---

## Для разработчиков

```text
nexus/
├─ packages/core   — адаптеры LLM (OpenAI-совместимый, Anthropic SDK, Gemini), SSE, MCP-клиент + OAuth, цены, цикл агента, протокол Relay
├─ apps/mobile     — Expo SDK 58 / React Native 0.88, Expo Router, SQLite, SecureStore
└─ apps/relay      — Node.js: мост stdio-MCP → HTTP, сопряжение по QR, синхронизация, файлы
```

```bash
pnpm install
pnpm check              # typecheck + lint + тесты всех пакетов
pnpm --filter @nexus/mobile start   # Metro; приложению нужен dev-build (npx expo run:android)
pnpm relay              # запустить Relay из исходников
pnpm apk                # подписанные release-APK в apps/mobile/dist (нужны JDK 17 и Android SDK)
```

### Подпись APK

Без переменных окружения APK подписывается **общим ключом** `apps/mobile/signing/nexus-shared.keystore`. Благодаря этому сборки из CI ставятся поверх друг друга. Для личного использования этого достаточно. Чтобы подписывать своим ключом:

```bash
apps/mobile/scripts/gen-keystore.sh          # или gen-keystore.ps1 на Windows
export NEXUS_KEYSTORE_PATH=… NEXUS_KEYSTORE_PASSWORD=… NEXUS_KEY_ALIAS=nexus NEXUS_KEY_PASSWORD=…
pnpm apk
```

Для GitHub Actions добавьте секреты `NEXUS_KEYSTORE_BASE64` (`base64 -w0 nexus-release.keystore`) и `NEXUS_KEYSTORE_PASSWORD`. **Сохраните ключ:** обновление ставится поверх только при той же подписи. После смены ключа приложение придётся один раз переустановить; перед этим сделайте резервную копию: Настройки → Приватность → Экспорт.

### Релиз

Каждый пуш (в `main` или рабочую ветку) публикует GitHub Release `nexus-v1.0.<run>` с APK и Relay. Для своей версии можно запушить тег `nexus-vX.Y.Z`. Приложение находит новые релизы через проверку обновлений.

Архитектурные решения описаны в [docs/DECISIONS.md](docs/DECISIONS.md), приватность — в [docs/PRIVACY.md](docs/PRIVACY.md).
