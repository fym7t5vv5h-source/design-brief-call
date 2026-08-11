# Brief

Один список клиентов в облаке: телефон и ноутбук — один вход.

## Открыть с телефона (сейчас, та же Wi‑Fi)

1. На компьютере должен работать сервер.
2. Компьютер и телефон в **одной Wi‑Fi**.
3. На телефоне в Safari/Chrome откройте:

```text
http://192.168.0.168:5173/
```

4. Войдите тем же **email и паролем**, что на ноутбуке.

Если не открывается: на Mac → Системные настройки → Сеть → Wi‑Fi — проверьте IP (иногда меняется). Подставьте актуальный вместо `192.168.0.168`.

Запуск сервера, если остановился:

```bash
cd design-brief-call
python3 -m http.server 5173
```

## Постоянная ссылка (интернет, не только домашний Wi‑Fi)

### Netlify Drop (быстро)

1. [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Перетащите папку `design-brief-call`
3. Откройте выданную ссылку на телефоне
4. Supabase → Authentication → URL Configuration → добавьте эту ссылку в Site URL и Redirect URLs

### GitHub Pages

1. Загрузите проект в GitHub
2. Settings → Pages → Deploy from branch `main` / root
3. Откройте `https://ВАШ_НИК.github.io/design-brief-call/`
4. Ту же ссылку добавьте в Supabase URL Configuration

## Облако

Клиенты в Supabase. Один email/пароль везде.

Если ошибка про `object_type` — SQL Editor → Run [`sql/fix-object-type.sql`](sql/fix-object-type.sql).  
Полная схема: [`sql/schema.sql`](sql/schema.sql).
