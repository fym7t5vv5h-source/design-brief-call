# Brief Design

Один список клиентов в облаке: телефон и ноутбук — один вход.

## Ссылка сайта

После переименования репозитория в `design-brief`:

```text
https://fym7t5vv5h-source.github.io/design-brief/
```

(Пока репозиторий называется `design-brief-call` — работает ссылка с `-call`.)

## Открыть с телефона

1. Откройте ссылку в Safari/Chrome
2. Войдите тем же **email и паролем**, что на ноутбуке

## Обновления через GitHub Desktop

Commit → Push origin → через 1–2 минуты сайт обновится. Клиенты в облаке не пропадают.

## Облако (Supabase)

Если ошибка про `object_type` — SQL Editor → Run [`sql/fix-object-type.sql`](sql/fix-object-type.sql).  
Полная схема: [`sql/schema.sql`](sql/schema.sql).

После смены ссылки добавьте новый URL в Supabase → Authentication → URL Configuration.
