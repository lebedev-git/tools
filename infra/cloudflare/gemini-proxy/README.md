# Gemini proxy (Cloudflare Worker)

Прозрачный реверс‑прокси для Google Generative Language API (Gemini).

## Зачем

Google отдаёт `429 RESOURCE_EXHAUSTED` с `limit: 0` для бесплатных запросов Gemini
с IP заблокированных регионов (в т.ч. РФ). Из‑за этого в воркере падают:

- `mapSpeakersToNames` — подстановка имён вместо «Спикер N» в стенограмме;
- `generateProtocol` — генерация протокола;
- загрузка аудио в аналитике (`uploadFile` → Files API).

Прокидывание трафика через Cloudflare даёт незаблокированный egress‑IP и снимает гео‑ограничение.
Правок в коде проекта не требуется — меняется только base URL Gemini.

## Что покрывает

Всё, что вызывает `GeminiClient`: `generateContent`, Files API (`getFileState`,
`deleteFile`) и **resumable‑загрузку** (второй leg по `x-goog-upload-url`
переписывается обратно на воркер, поэтому тоже идёт через Cloudflare).

## Доступ

Не открытый прокси: первый сегмент пути должен совпадать с секретом `PROXY_SECRET`.
Итоговый base URL для приложения:

```
https://<worker>.workers.dev/<PROXY_SECRET>
```

GeminiClient сам допишет `/v1beta/...` и `/upload/v1beta/...`.

## Деплой

```bash
cd infra/cloudflare/gemini-proxy
npx wrangler login                 # или CLOUDFLARE_API_TOKEN=... в окружении
npx wrangler secret put PROXY_SECRET   # вставить сгенерированный секрет
npx wrangler deploy
```

После деплоя wrangler выведет URL вида `https://gemini-proxy.<subdomain>.workers.dev`.

## Подключение в проекте

Задать на сервере (`.env`, затем перезапуск `worker` и `web`):

```
GEMINI_BASE_URL=https://gemini-proxy.<subdomain>.workers.dev/<PROXY_SECRET>
```

`GEMINI_BASE_URL` — дефолт и для протоколов, и для аналитики
(`runtimeConfig.ts:75‑76`, `104‑106`). Точечно можно переопределить через настройки
`config.gemini_base_url_protocols` / `config.gemini_base_url_analytics` в UI «Настройки».

## Проверка

```bash
curl -s "https://gemini-proxy.<subdomain>.workers.dev/<PROXY_SECRET>/v1beta/models?key=<GEMINI_KEY>" | head
```

Должен вернуться список моделей (а не 403/429 `limit: 0`).
