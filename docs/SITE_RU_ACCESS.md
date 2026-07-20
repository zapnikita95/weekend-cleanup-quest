# tidytitans.ru в РФ

## Почему без VPN «не открывается»

`www.tidytitans.ru` → CNAME → `g80obd53.up.railway.app` → IP Railway `69.46.46.x` (US).  
С многих сетей в РФ TCP до этих IP **таймаутится**. Apex тоже на Railway.

Cloudflare из РФ обычно доступен (проверка: открывается `https://www.cloudflare.com`).

## Фикс: Cloudflare Proxied перед Railway

1. https://dash.cloudflare.com → **Add a site** → `tidytitans.ru` → Free  
2. Reg.ru → DNS-серверы домена → NS от Cloudflare  
3. В Cloudflare DNS:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `www` | `g80obd53.up.railway.app` | **Proxied** |
| CNAME | `@` | `g80obd53.up.railway.app` | **Proxied** |

4. SSL/TLS → **Full** (не Flexible)  
5. Удалить A-записи парковки Reg.ru, если подтянулись

Проверка из РФ без VPN:

```powershell
Resolve-DnsName www.tidytitans.ru -Type A -Server 8.8.8.8
# IP Cloudflare (104.x / 172.x / …), НЕ 69.46.46.x

curl.exe -sI --max-time 15 "https://www.tidytitans.ru/"
# Server: cloudflare
```

То же для `efir-ai.ru` — см. neuroradio `docs/SITE_RU_ACCESS.md`.

## Почему после Cloudflare всё ещё «чёрный экран»

Сайт — SPA: HTML приходит быстро, а игра рисуется только после загрузки `/assets/*.js`.  
Если у статики нет `Cache-Control`, Cloudflare ставит `cf-cache-status: DYNAMIC` и **каждый** запрос JS идёт на Railway → из РФ ~20–90 с на маленький бандл → браузер показывает пустой `#root`.

В `server.mjs` для `/assets/*` отдаётся `Cache-Control: public, max-age=31536000, immutable`.  
После деплоя: `curl -sI https://www.tidytitans.ru/assets/…` → `HIT`/`MISS` + длинный cache, не `DYNAMIC` без max-age.

Пока JS грузится, в HTML виден `#seo-prerender` («Загружаем игру…»), а не чёрный экран.
