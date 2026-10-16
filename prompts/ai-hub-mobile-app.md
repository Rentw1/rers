# ПРОМПТ: мобильный AI-клиент «как Claude» с DeepSeek, мульти-провайдерами, MCP и связью с ПК

> Скопируй всё ниже линии в Claude Code / Cursor / любой агент-кодер. Промпт самодостаточный.

---

## РОЛЬ И РЕЖИМ

Ты — principal-инженер мобильной разработки. Построй **полностью рабочее** приложение под ключ: монорепо, весь код, конфиги, сборка APK. Без плейсхолдеров, без `TODO`, без `...`. Неясность → принимай сильное инженерное решение и фиксируй его в `docs/DECISIONS.md`. Вопросов не задавай. После каждой фазы — `pnpm typecheck && pnpm lint && pnpm test` зелёные, затем коммит.

## ЦЕЛЬ

Приложение **«Nexus»** — мобильный AI-чат с UX как у приложения Claude (claude.ai mobile):
1. **DeepSeek по умолчанию** (через API-ключ пользователя).
2. **Любые другие ИИ** подключаются ключом: OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, xAI, Qwen, Moonshot/Kimi, Together, Perplexity, локальные (Ollama / LM Studio) + **произвольный OpenAI-совместимый endpoint**.
3. **MCP-клиент на телефоне**: удалённые MCP-серверы + встроенные «телефонные» инструменты (контакты, календарь, файлы, геолокация, буфер, уведомления, камера, SMS-интент).
4. **Связь телефона с ПК** (компаньон-приложение Relay): запуск stdio-MCP серверов на компьютере, доступ к файлам/терминалу ПК с телефона, синхронизация чатов.
5. **Цены и расход**: стоимость каждого сообщения, чата, дня/месяца, по провайдерам и моделям; лимиты бюджета с предупреждениями.

## СТЕК (фиксированный)

| Слой | Технология |
|---|---|
| Монорепо | pnpm workspaces + Turborepo, TypeScript strict везде |
| Мобилка | Expo SDK (последний стабильный) + React Native, Expo Router, `expo/fetch` (стриминг SSE) |
| UI | Tamagui или NativeWind + Reanimated 3, `react-native-markdown-display` / `react-native-marked`, подсветка кода `react-native-syntax-highlighter`, KaTeX через WebView |
| Состояние | Zustand + TanStack Query |
| БД | `expo-sqlite` + Drizzle ORM (миграции) |
| Секреты | `expo-secure-store` (ключи API никогда не в SQLite/логах) |
| Валидация | Zod на всех границах (API-ответы, MCP, конфиги, QR-payload) |
| MCP | `@modelcontextprotocol/sdk` (клиент, Streamable HTTP + SSE legacy); если SDK не собирается под Hermes — собственный минимальный JSON-RPC 2.0 клиент Streamable HTTP в `packages/mcp-lite` с тестами |
| Relay (ПК) | Node 22 + Fastify + `@modelcontextprotocol/sdk` (stdio→Streamable HTTP мост), WebSocket, упаковка в single binary (`pkg`/`bun build --compile`) для Win/macOS/Linux |
| Тесты | Vitest (packages), Jest + RNTL (mobile), Maestro e2e (основные флоу) |
| Сборка | EAS Build profile `preview` → APK; локально `npx expo run:android` |

## СТРУКТУРА

```
nexus/
├─ apps/
│  ├─ mobile/            # Expo-приложение
│  └─ relay/             # компаньон для ПК
├─ packages/
│  ├─ providers/         # адаптеры LLM + реестр моделей + цены
│  ├─ mcp-lite/          # MCP-клиент (fallback) + общие типы
│  ├─ usage/             # подсчёт токенов и стоимости
│  └─ shared/            # Zod-схемы, протокол phone<->relay
└─ docs/ (DECISIONS.md, PROVIDERS.md, RELAY.md, PRIVACY.md)
```

## 1. ПРОВАЙДЕРЫ ИИ

### 1.1 Архитектура
- Единый интерфейс:
  ```ts
  interface LLMProvider {
    id: string; name: string; kind: 'openai-compatible'|'anthropic'|'gemini';
    listModels(key: string): Promise<ModelInfo[]>;
    chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent>; // text | reasoning | tool_call | usage | error | done
    validateKey(key: string): Promise<{ok: boolean; error?: string}>;
  }
  ```
- 3 адаптера: **OpenAI-compatible** (покрывает DeepSeek, OpenAI, OpenRouter, Groq, Mistral, xAI, Qwen, Moonshot, Together, Perplexity, Ollama, LM Studio, custom), **Anthropic Messages**, **Gemini**.
- Унифицированный tool calling (MCP-инструменты → формат провайдера и обратно), стриминг, отмена (AbortController), ретраи с экспоненциальной задержкой на 429/5xx с учётом `retry-after`, таймауты.
- Если модель не поддерживает tools — инструменты скрываются, в UI бейдж «без инструментов».
- **Reasoning-вывод** (DeepSeek `reasoning_content`, Anthropic thinking, OpenAI reasoning) → сворачиваемый блок «Размышления» как в Claude.

### 1.2 DeepSeek — по умолчанию
- Base URL `https://api.deepseek.com`, модели `deepseek-chat` и `deepseek-reasoner` (актуальный список подтягивать через `GET /models`).
- Учитывать `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` из `usage` — отдельная цена за кэш-хиты.
- Баланс аккаунта: `GET https://api.deepseek.com/user/balance` → показывать в шапке «Расход».
- Первый запуск: онбординг → «Вставьте ключ DeepSeek» + кнопка «Получить ключ».

### 1.3 Каталог провайдеров (встроить в `packages/providers/catalog.ts`, ссылки — кликабельные кнопки «Получить ключ» и «Цены»)

| Провайдер | Base URL | Получить ключ | Цены |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com` | https://platform.deepseek.com/api_keys | https://api-docs.deepseek.com/quick_start/pricing |
| OpenAI | `https://api.openai.com/v1` | https://platform.openai.com/api-keys | https://openai.com/api/pricing |
| Anthropic | `https://api.anthropic.com` | https://console.anthropic.com/settings/keys | https://www.anthropic.com/pricing#api |
| Google Gemini | `https://generativelanguage.googleapis.com` | https://aistudio.google.com/apikey | https://ai.google.dev/gemini-api/docs/pricing |
| OpenRouter (сотни моделей одним ключом) | `https://openrouter.ai/api/v1` | https://openrouter.ai/settings/keys | https://openrouter.ai/models |
| Groq | `https://api.groq.com/openai/v1` | https://console.groq.com/keys | https://groq.com/pricing |
| Mistral | `https://api.mistral.ai/v1` | https://console.mistral.ai/api-keys | https://mistral.ai/pricing |
| xAI (Grok) | `https://api.x.ai/v1` | https://console.x.ai | https://docs.x.ai/docs/models |
| Qwen (Alibaba DashScope Intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | https://bailian.console.alibabacloud.com/?apiKey=1 | https://www.alibabacloud.com/help/en/model-studio/models |
| Moonshot / Kimi | `https://api.moonshot.ai/v1` | https://platform.moonshot.ai/console/api-keys | https://platform.moonshot.ai/docs/pricing |
| Together AI | `https://api.together.xyz/v1` | https://api.together.ai/settings/api-keys | https://www.together.ai/pricing |
| Perplexity | `https://api.perplexity.ai` | https://www.perplexity.ai/settings/api | https://docs.perplexity.ai/guides/pricing |
| Ollama (локально/по сети) | `http://<ip>:11434/v1` | ключ не нужен, https://ollama.com/download | бесплатно |
| LM Studio | `http://<ip>:1234/v1` | ключ не нужен, https://lmstudio.ai | бесплатно |
| Custom | любой OpenAI-совместимый | — | ввод цен вручную |

- Экран провайдера: ключ (маскирован, кнопка «показать»), base URL (редактируемый), «Проверить» (validateKey), список моделей с переключателями «показывать в выборе», ссылки «Получить ключ» / «Цены» / «Документация».
- Выбор модели в чате — шторка снизу как в Claude: группы по провайдерам, поиск, избранное, у каждой модели: контекст, цена in/out за 1M, бейджи (vision / tools / reasoning).

## 2. ЦЕНЫ И РАСХОД

- `packages/usage`:
  - Таблица цен `pricing.json`: `{providerId, modelId, inputPer1M, outputPer1M, cacheReadPer1M?, cacheWritePer1M?, reasoningPer1M?, currency:'USD', source, updatedAt}`.
  - **Источники цен по приоритету**: (1) ручная правка пользователя → (2) OpenRouter `GET /api/v1/models` (поле `pricing`, бесплатно, без ключа) — автообновление раз в сутки с сопоставлением id моделей → (3) встроенный seed. Seed-значения взять из официальных страниц выше на момент сборки и указать дату в `updatedAt`; в UI показывать «цены от <дата>, проверьте по ссылке».
  - Токены — только из `usage` ответа провайдера. Если провайдер не вернул usage — оценка через `js-tiktoken` (o200k_base) с пометкой «≈».
  - Стоимость хранить в **микродолларах (integer)** — никаких float-ошибок.
- Таблица `usage_events(id, chat_id, message_id, provider_id, model_id, input_tokens, output_tokens, cache_hit_tokens, reasoning_tokens, cost_micro_usd, estimated:boolean, created_at)` + индексы по `created_at`, `provider_id`.
- UI:
  - Под каждым ответом мелко: `1 240 → 380 ток · $0.0007 · 2.1 с · deepseek-chat` (тап → детализация).
  - Шапка чата: суммарная стоимость чата.
  - Экран **«Расход»**: сегодня / 7 дней / месяц / всё; графики (victory-native или react-native-gifted-charts) по дням, донат по провайдерам, топ-моделей, топ-чатов; баланс DeepSeek и OpenRouter (`GET /api/v1/credits`) где API позволяет.
  - Валюта отображения: USD / RUB / EUR, курс — `https://open.er-api.com/v6/latest/USD` раз в сутки, офлайн-кэш.
  - **Бюджеты**: дневной/месячный лимит общий и по провайдеру; 80% → предупреждение, 100% → блок отправки с кнопкой «Отправить всё равно». Локальное уведомление `expo-notifications`.
  - Экспорт CSV расхода (`expo-sharing`).

## 3. UI/UX «как Claude»

- Тёмная и светлая темы (тёплая палитра, кремовый фон светлой темы, терракотовый акцент), системная по умолчанию, шрифт с засечками для ответов опционально.
- Экраны: Онбординг → Чаты (боковое меню-дровер со списком, поиск, «Проекты») → Чат → Выбор модели → Настройки (Провайдеры, MCP, Устройства/Relay, Расход, Бюджеты, Внешний вид, Приватность, Экспорт/Импорт).
- Чат: стриминг токенов с плавной анимацией, кнопка «Стоп», копировать/поделиться/перегенерировать/редактировать сообщение (ветвление — хранить дерево сообщений, переключатель `< 2/3 >`), Markdown, таблицы, код с кнопкой копирования, LaTeX, сворачиваемые «Размышления», карточки вызовов инструментов (имя, аргументы, результат, статус, кнопки «Разрешить один раз / Всегда / Отклонить»).
- Ввод: многострочный, вложения (фото с камеры/галереи → vision-модели; файлы PDF/TXT/MD → извлечение текста), голосовой ввод (`expo-speech-recognition`), быстрый выбор модели над клавиатурой.
- **Проекты** (как Claude Projects): системный промпт + прикреплённые файлы-знания + модель по умолчанию + набор MCP-серверов.
- **Artifacts-lite**: если ответ содержит ```html или svg — кнопка «Открыть превью» в WebView (sandbox, без доступа к сети по умолчанию).
- Автоназвание чата дешёвой моделью после первого ответа.
- Хаптика, жесты свайпа, доступность (accessibilityLabel везде, Dynamic Type).
- Локализация RU/EN (i18next), RU по умолчанию.

## 4. MCP НА ТЕЛЕФОНЕ

### 4.1 Удалённые MCP-серверы
- Добавление: URL + транспорт (Streamable HTTP по умолчанию, SSE legacy) + авторизация (нет / Bearer / заголовки / **OAuth 2.1 с PKCE** через `expo-auth-session`, по спецификации MCP Authorization, dynamic client registration).
- Добавление через **QR-код** или deep link `nexus://mcp/add?config=<base64-json>`.
- Импорт JSON в формате `mcpServers` (как у Claude Desktop) — remote-записи добавляются напрямую, stdio-записи автоматически предлагается запускать через Relay на ПК.
- Для каждого сервера: статус (подключён/ошибка/переподключение), список tools/resources/prompts, вкл/выкл каждого инструмента, политика разрешений (спрашивать / авто-разрешать), лог вызовов.
- Поддержать `tools/list_changed`, `resources/read` (прикрепить ресурс в чат), `prompts/get` (слэш-команды `/` в поле ввода), progress-уведомления, отмена.
- Переподключение с backoff, `Mcp-Session-Id`, keep-alive; фоновые соединения закрываются при уходе приложения в фон и восстанавливаются при возврате.

### 4.2 Встроенный сервер «Телефон» (in-process, тот же интерфейс, что MCP)
Каждый инструмент — Zod-схема + запрос runtime-разрешения ОС + подтверждение пользователя в чате для опасных действий:

| Tool | Модуль | Подтверждение |
|---|---|---|
| `contacts_search` | expo-contacts | нет (чтение) |
| `calendar_list_events`, `calendar_create_event` | expo-calendar | создание — да |
| `location_get` | expo-location | нет |
| `clipboard_read`, `clipboard_write` | expo-clipboard | чтение — да |
| `files_pick`, `files_read`, `files_save` | expo-document-picker, expo-file-system | запись — да |
| `camera_take_photo` | expo-image-picker | да |
| `notify_schedule` | expo-notifications | нет |
| `sms_compose`, `call_dial`, `email_compose` | expo-sms, Linking, expo-mail-composer | открывает системный UI, отправляет пользователь |
| `device_info` (батарея, сеть, модель) | expo-battery, expo-network, expo-device | нет |
| `open_url`, `share` | expo-web-browser, expo-sharing | нет |
| `web_fetch` (текст страницы, readability) | fetch + парсер | нет |

## 5. СВЯЗЬ ТЕЛЕФОН ⇄ ПК (apps/relay)

- Relay — консольное приложение + простая веб-панель на `http://localhost:4545`:
  - Читает `relay.config.json` в формате `mcpServers` (совместим с конфигом Claude Desktop — кнопка «Импортировать из Claude Desktop», пути: `%APPDATA%/Claude/claude_desktop_config.json`, `~/Library/Application Support/Claude/claude_desktop_config.json`, `~/.config/Claude/claude_desktop_config.json`).
  - Запускает stdio-MCP серверы (filesystem, git, playwright, любые npx/uvx) и **проксирует их** в один Streamable HTTP endpoint `/mcp/<serverId>` с агрегацией в `/mcp` (префиксы имён инструментов `serverId__tool`).
  - Встроенные инструменты ПК: `pc_files_list/read/write` (только в разрешённых папках), `pc_shell_exec` (выключен по умолчанию, allowlist команд, таймаут, лимит вывода), `pc_screenshot`, `pc_clipboard`, `pc_notify`.
- **Сопряжение**: Relay показывает QR (в терминале и веб-панели) с `{url, deviceToken, certFingerprint}`; телефон сканирует (`expo-camera`) → сохраняет в secure-store. Токен 256 бит, хранится на ПК только хеш (argon2/scrypt), отзыв устройства из панели.
- **Сеть**: (1) LAN — автообнаружение через mDNS (`_nexus._tcp`) + self-signed TLS с пиннингом отпечатка; (2) удалённо — инструкции и автонастройка для Tailscale (рекомендуется) и `cloudflared tunnel`; ссылки: https://tailscale.com/download, https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/.
- **WebSocket-канал** `/ws`: присутствие устройства, push событий (вызов инструмента завершён, файл готов), **синхронизация чатов** между телефоном и ПК (last-write-wins по `updated_at` + soft-delete, ключи API не синхронизируются никогда), отправка файлов телефон→ПК и обратно (чанки, проверка SHA-256).
- Rate limit, лимит размера тела, аудит-лог всех вызовов инструментов, CORS закрыт.

## 6. БЕЗОПАСНОСТЬ И ПРИВАТНОСТЬ

- Ключи API — только `expo-secure-store` (Keystore/Keychain), маскирование в UI, никогда в логах/крэш-репортах/экспортах.
- Биометрическая блокировка приложения опционально (`expo-local-authentication`).
- Все MCP-вызовы с побочными эффектами — явное подтверждение; лимит 25 tool-итераций на один ответ; защита от prompt-injection: результаты инструментов оборачиваются как данные, предупреждение при попытке инструмента вызвать опасный инструмент.
- Никакой телеметрии. Экспорт/импорт всех данных в JSON (без ключей) и полное удаление.
- HTTP разрешён только для локальных адресов (Ollama/LM Studio/Relay в LAN) — `usesCleartextTraffic` через network security config только для приватных подсетей.

## 7. ДАННЫЕ (Drizzle-схема, минимум)

`providers`, `models`, `pricing`, `projects`, `chats`, `messages` (parent_id для ветвления, role, content JSON-блоки: text/image/tool_use/tool_result/reasoning), `attachments`, `mcp_servers`, `mcp_tool_prefs`, `usage_events`, `budgets`, `devices`, `settings`. Все внешние ключи + индексы, миграции версионированы.

## 8. ПОРЯДОК РАБОТЫ (фазы, после каждой — зелёные проверки и коммит)

1. Монорепо, тулинг, CI (GitHub Actions: typecheck, lint, test, EAS build preview по тегу).
2. `packages/providers` + `packages/usage` с unit-тестами на моках SSE (DeepSeek, Anthropic, Gemini, OpenAI-compatible), включая reasoning, tool calls, usage, ошибки, отмену.
3. Мобилка: навигация, тема, БД, онбординг DeepSeek, чат со стримингом, выбор модели, расход.
4. Мульти-провайдеры: экраны ключей, каталог со ссылками, валидация, синхронизация моделей и цен.
5. MCP: `mcp-lite`, удалённые серверы, OAuth, встроенный «Телефон», карточки инструментов, разрешения.
6. Relay: stdio-мост, QR-сопряжение, TLS-пиннинг, mDNS, WebSocket-синхронизация, инструменты ПК, бинарники.
7. Проекты, артефакты-превью, голос, вложения, бюджеты, уведомления, экспорт.
8. Полировка UX, доступность, i18n, Maestro e2e: онбординг → чат → вызов MCP-инструмента → проверка расхода; сопряжение с Relay.

## 9. КРИТЕРИИ ПРИЁМКИ

- [ ] `pnpm i && pnpm dev` поднимает мобилку (Expo) и Relay; `eas build -p android --profile preview` даёт рабочий APK.
- [ ] С одним ключом DeepSeek: стриминг ответа, reasoning-блок у `deepseek-reasoner`, стоимость под сообщением совпадает с формулой по `usage` (с учётом cache hit).
- [ ] Добавление ключа OpenRouter/OpenAI/Anthropic/Gemini → модели появляются в выборе, переключение модели внутри чата работает.
- [ ] Удалённый MCP-сервер по URL и по QR подключается, инструмент вызывается моделью, результат виден в карточке.
- [ ] Встроенные инструменты телефона работают с запросом разрешений.
- [ ] Relay на ПК: сопряжение по QR, stdio-сервер `@modelcontextprotocol/server-filesystem` доступен с телефона, чат синхронизирован.
- [ ] Экран «Расход» показывает корректные суммы по дням/провайдерам/моделям, бюджет блокирует отправку при превышении.
- [ ] Ключи отсутствуют в SQLite, логах и экспорте (есть тест).
- [ ] README с пошаговой установкой для не-программиста: где взять ключи (ссылки из таблицы), как поставить APK, как запустить Relay на Windows/macOS/Linux, как подключить MCP.

Начинай с фазы 1. Пиши код полностью.
