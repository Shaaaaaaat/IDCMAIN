# ТЗ: Обработка возврата Ameria для TG-бота на сайте (Vercel)

## 1. Общий контекст

### Архитектура
- **Telegram-бот** (Node.js, Railway) — создаёт платежи Ameriabank VPOS для EUR/USD, отправляет пользователю ссылку на оплату.
- **Сайт** (Vercel) — idocalisthenics.com. Уже имеет оплату Ameria.
- **BackURL** — адрес, на который банк перенаправляет пользователя после оплаты (успешной, отменённой или при ошибке).

### Текущая настройка бота
- `APP_BASE_URL = https://idocalisthenics.com`
- BackURL, которую бот передаёт в Ameria:  
  `https://idocalisthenics.com/pay/ameria/return?locale=ru`
- Банк добавляет свои query-параметры и делает GET-редирект.

### Задача
Сайт должен обрабатывать GET-запросы на путь возврата и показывать пользователю корректное сообщение. Сейчас эти запросы приходят на Vercel — маршрут нужно добавить или доработать.

---

## 2. Точный путь и метод

- **Путь:** `/pay/ameria/return`
- **Метод:** GET
- **Полный пример URL от банка:**
  ```
  https://idocalisthenics.com/pay/ameria/return?locale=ru&orderID=1840613344&resposneCode=0999&paymentID=FF5AD853-2E10-4CFA-B959-E354EB0C8A4C&opaque=%7B%22tariffId%22%3A%22ds_eur_light_start%22%2C%22email%22%3A%22...
  ```

**Важно:** у банка в API опечатка — параметр приходит как `resposneCode`, а не `responseCode`. Обработка должна учитывать оба варианта.

---

## 3. Query-параметры от банка

| Параметр | Тип | Описание |
|----------|-----|----------|
| `locale` | string | `ru` или `en` — язык интерфейса |
| `orderID` | string | ID заказа (число в виде строки) |
| `responseCode` | string | Код результата (может не приходить) |
| `resposneCode` | string | Код результата (опечатка банка — приходит вместо responseCode) |
| `paymentID` | string | UUID платежа Ameria |
| `opaque` | string | URL-encoded JSON с доп. данными (tariffId, email и т.п.) |

**Алгоритм получения кода:**
```
code = req.query.responseCode || req.query.resposneCode || ""
code = String(code).trim()
```

---

## 4. Логика сообщений по коду

| Условие | Значение | Текст (RU) | Текст (EN) |
|---------|----------|------------|------------|
| `code === "00"` | Успешная оплата | Оплата проведена. Вы можете вернуться в бота — подтверждение придёт в течение нескольких минут. | Payment completed. You can return to the bot — confirmation will arrive shortly. |
| `code` не пустой и ≠ `"00"` | Отказ / ошибка | Оплата не прошла. Вернитесь в бота — можно повторить или проверить статус. | Payment was not completed. Return to the bot to try again or check status. |
| `code` пустой или отсутствует | В обработке | Платёж обрабатывается. Вернитесь в бота — подтверждение придёт в течение нескольких минут. | Payment is being processed. Return to the bot — confirmation will arrive within a few minutes. |

**Выбор языка:**
```
locale = query.locale || "ru"
lang = (locale.toLowerCase().startsWith("en")) ? "en" : "ru"
```
Использовать `lang` для выбора текста RU/EN.

---

## 5. Пример алгоритма (псевдокод)

```
GET /pay/ameria/return:
  code = (query.resposneCode || query.responseCode || "").trim()
  locale = (query.locale || "ru").toLowerCase()
  lang = locale.startsWith("en") ? "en" : "ru"

  if code === "00":
    msg = SUCCESS_MSG[lang]
  else if code !== "":
    msg = DECLINED_MSG[lang]
  else:
    msg = PENDING_MSG[lang]

  return HTML page with msg, charset UTF-8
```

---

## 6. Тексты сообщений (копировать)

**RU (успех):**  
Оплата проведена. Вы можете вернуться в бота — подтверждение придёт в течение нескольких минут.

**RU (отказ):**  
Оплата не прошла. Вернитесь в бота — можно повторить или проверить статус.

**RU (в процессе):**  
Платёж обрабатывается. Вернитесь в бота — подтверждение придёт в течение нескольких минут.

**EN (успех):**  
Payment completed. You can return to the bot — confirmation will arrive shortly.

**EN (отказ):**  
Payment was not completed. Return to the bot to try again or check status.

**EN (в процессе):**  
Payment is being processed. Return to the bot — confirmation will arrive within a few minutes.

---

## 7. Требования к странице

- Content-Type: `text/html; charset=utf-8`
- Минимальная валидная HTML5-разметка
- Стили — по дизайну сайта (или минимальная заглушка)
- Сообщение должно быть читаемо на мобильных

**Минимальный HTML:**
```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Оплата</title>
</head>
<body>
  <p>{msg}</p>
</body>
</html>
```

---

## 8. Особенности по фреймворкам

### Next.js (App Router)
- Файл: `app/pay/ameria/return/page.tsx` (или `page.js`)
- Использовать `searchParams` для query.

### Next.js (Pages Router)
- Файл: `pages/pay/ameria/return.tsx` (или `.js`)
- Использовать `router.query` / `context.query`.

### Статика / другой фреймворк
- Нужен серверный обработчик GET `/pay/ameria/return`, который читает query и отдаёт HTML.

---

## 9. Возможные пути на сайте

Если сайт использует локаль в пути (например `/ru/`, `/en/`), варианты:
- A) Добавить `/pay/ameria/return` без префикса локали — бот уже передаёт `?locale=ru` в query.
- B) Добавить `/ru/pay/ameria/return` и `/en/pay/ameria/return` — тогда в боте нужно обновить BackURL на `${appUrl}/ru/pay/ameria/return?locale=ru` (или аналогично для en).

**Рекомендация:** Вариант A проще — один маршрут, язык через query.

---

## 10. Правки в боте (при необходимости)

Если на сайте путь другой, в `index.js` бота (строка ~115) заменить:
```javascript
BackURL: `${appUrl}/pay/ameria/return?locale=${loc}`
```
на нужный путь, например:
```javascript
BackURL: `${appUrl}/ru/pay/ameria/return?locale=${loc}`
```
или иной формат, согласованный со структурой сайта.

---

## 11. Чек-лист для проверки

- [ ] Маршрут `/pay/ameria/return` существует и обрабатывает GET
- [ ] Читаются и `responseCode`, и `resposneCode`
- [ ] Для `code === "00"` показывается сообщение об успехе
- [ ] Для `code !== "00"` и не пустого — сообщение об отказе
- [ ] Для пустого `code` — сообщение «в процессе»
- [ ] Учитывается `locale` для RU/EN
- [ ] Content-Type: text/html; charset=utf-8
- [ ] Страница открывается на мобильных
- [ ] При необходимости обновлён BackURL в боте

---

## 12. Задачи для ИИ

1. Изучить структуру проекта на Vercel и способ маршрутизации.
2. Найти существующую обработку возврата Ameria (если есть) и используемый путь.
3. Добавить или доработать обработчик GET `/pay/ameria/return` по этой спецификации.
4. Проверить логику по `responseCode` / `resposneCode` и текстам RU/EN.
5. Сообщить, нужен ли другой путь — и тогда указать точную строку BackURL для обновления в боте.
