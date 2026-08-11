# Brief

Одно место для всех брифов: клиент + объект + два созвона (планировка и дизайн).

## Как открыть с телефона и компьютера (бесплатно)

Сайт — обычные файлы. Их можно выложить на **GitHub Pages**. Тогда будет постоянная ссылка вида:

`https://ВАШ_НИК.github.io/design-brief-call/`

### 1. Создайте репозиторий на GitHub

1. Откройте [github.com/new](https://github.com/new)
2. Repository name: `design-brief-call`
3. Public → **Create repository**
4. **не** ставьте галочки README / .gitignore (у вас уже есть файлы)

### 2. Загрузите папку проекта

На странице нового репозитория GitHub предложит «uploading an existing file»:

1. Нажмите **uploading an existing file**
2. Перетащите **всё содержимое** папки `design-brief-call`  
   (`index.html`, `styles.css`, папки `js`, `sql`, `supabase`, `README.md`)
3. Commit changes

Или через терминал (если уже есть git remote):

```bash
cd design-brief-call
git remote add origin https://github.com/ВАШ_НИК/design-brief-call.git
git push -u origin main
```

### 3. Включите GitHub Pages

1. Репозиторий → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder `/ (root)` → Save
4. Через 1–2 минуты откройте ссылку вида  
   `https://ВАШ_НИК.github.io/design-brief-call/`

Эту же ссылку можно открыть на телефоне и на компьютере.

### 4. Чтобы данные были одни и те же везде

Локальный режим хранит ответы **только в этом браузере**.  
Чтобы телефон и ноутбук видели одни брифы — нужен Supabase (у вас уже подключен в `js/config.js`):

1. [supabase.com](https://supabase.com) → ваш проект
2. SQL Editor → вставить `sql/schema.sql` → Run (если ещё не делали)
3. Authentication → Users → Add user (email + пароль)
4. Authentication → URL Configuration → в **Site URL** и **Redirect URLs** добавьте вашу GitHub Pages ссылку

После этого на телефоне и компьютере входите одним аккаунтом.

---

## Запуск только на компьютере (без сайта)

```bash
cd design-brief-call
python3 -m http.server 5173
```

Откройте http://localhost:5173

- Главный экран: **Все брифы**
- **+ Новый бриф** → имя клиента + объект → сразу оба брифа
- Кнопки **Бэкап / Импорт** — чтобы не потерять данные в локальном режиме
