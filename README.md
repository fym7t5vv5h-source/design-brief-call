# Brief

Одно место для всех брифов: клиент + объект + два созвона (планировка и дизайн).

## Запуск (бесплатно, уже работает)

```bash
cd design-brief-call
python3 -m http.server 5173
```

Откройте http://localhost:5173

- Главный экран: **Все брифы**
- **+ Новый бриф** → имя клиента + объект → сразу оба брифа
- Данные сохраняются в браузере; кнопки **Бэкап / Импорт** — чтобы не потерять

## Облако (по желанию, free)

Только если нужны те же брифы с телефона/другого ноутбука без файла бэкапа:

1. [supabase.com](https://supabase.com) → New project (Free)
2. SQL Editor → вставить `sql/schema.sql` → Run
3. Authentication → Users → Add user
4. Settings → API → вписать URL и anon key в `js/config.js`
