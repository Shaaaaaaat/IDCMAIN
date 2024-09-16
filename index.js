require("dotenv").config();
const { Bot, InlineKeyboard, Keyboard } = require("grammy");
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios");

// Логируем запуск приложения с информацией о пользователе
console.log("Приложение запущено");

const actionData = {
  buy_13200_msc_ycg: { sum: 13200, lessons: 12, tag: "MSC_group_YCG" },
  buy_1400_msc_ycg: { sum: 1400, lessons: 1, tag: "MSC_group_YCG" },
  buy_3600_personal_mscycg: { sum: 3600, lessons: 1, tag: "MSC_personal_YCG" },
  buy_32400_personal_mscycg: {
    sum: 32400,
    lessons: 10,
    tag: "MSC_personal_YCG",
  },
  buy_11400_spb_spi: { sum: 11400, lessons: 12, tag: "SPB_group_SPI" },
  buy_9600_spb_spi: { sum: 9600, lessons: 12, tag: "SPB_group_SPI" },
  buy_1100_spb_spi: { sum: 1100, lessons: 1, tag: "SPB_group_SPI" },
  buy_3600_personal_spbspi: { sum: 3600, lessons: 1, tag: "SPB_personal_SPI" },
  buy_32400_personal_spbspi: {
    sum: 32400,
    lessons: 10,
    tag: "SPB_personal_SPI",
  },
  buy_11400_spb_rtc: { sum: 11400, lessons: 12, tag: "SPB_group_RTC" },
  buy_9600_spb_rtc: { sum: 9600, lessons: 12, tag: "SPB_group_RTC" },
  buy_1100_spb_rtc: { sum: 1100, lessons: 1, tag: "SPB_group_RTC" },
  buy_3600_personal_spbrtc: { sum: 3600, lessons: 1, tag: "SPB_personal_RTC" },
  buy_32400_personal_spbrtc: {
    sum: 32400,
    lessons: 10,
    tag: "SPB_personal_RTC",
  },
  buy_11400_spb_hkc: { sum: 11400, lessons: 12, tag: "SPB_group_HKC" },
  buy_9600_spb_hkc: { sum: 9600, lessons: 12, tag: "SPB_group_HKC" },
  buy_1100_spb_hkc: { sum: 1100, lessons: 1, tag: "SPB_group_HKC" },
  buy_3600_personal_spbhkc: { sum: 3600, lessons: 1, tag: "SPB_personal_HKC" },
  buy_32400_personal_spbhkc: {
    sum: 32400,
    lessons: 10,
    tag: "SPB_personal_HKC",
  },
  buy_9600_ds: { sum: 9600, lessons: 12, tag: "ds" },
  buy_23400_ds: { sum: 23400, lessons: 36, tag: "ds" },
};

// Объект с данными для различных типов кнопок
const buttonsData = {
  group: {
    MSCYCG: [
      {
        text: "12 занятий (13 200₽) — действует 6 недель",
        callback_data: "buy_13200_msc_ycg",
      },
      {
        text: "1 занятие (1 400₽) — действует 4 недели",
        callback_data: "buy_1400_msc_ycg",
      },
    ],
    SPBSPI: [
      {
        text: "12 занятий (11 400₽) — действует 6 недель",
        callback_data: "buy_11400_spb_spi",
      },
      {
        text: "12 занятий (9 600₽) — действует 4 недели",
        callback_data: "buy_9600_spb_spi",
      },
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_spb_spi",
      },
    ],
    SPBRTC: [
      {
        text: "12 занятий (11 400₽) — действует 6 недель",
        callback_data: "buy_11400_spb_rtc",
      },
      {
        text: "12 занятий (9 600₽) — действует 4 недели",
        callback_data: "buy_9600_spb_rtc",
      },
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_spb_rtc",
      },
    ],
    SPBHKC: [
      {
        text: "12 занятий (11 400₽) — действует 6 недель",
        callback_data: "buy_11400_spb_hkc",
      },
      {
        text: "12 занятий (9 600₽) — действует 4 недели",
        callback_data: "buy_9600_spb_hkc",
      },
      {
        text: "1 занятие (1 100₽) — действует 4 недели",
        callback_data: "buy_1100_spb_hkc",
      },
    ],
  },
  personal: {
    MSCYCG: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_mscycg",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_mscycg",
      },
    ],
    SPBSPI: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_spbspi",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_spbspi",
      },
    ],
    SPBRTC: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_spbrtc",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_spbrtc",
      },
    ],
    SPBHKC: [
      {
        text: "10 занятий (32 400₽) — действует 6 недель",
        callback_data: "buy_32400_personal_spbhkc",
      },
      {
        text: "1 занятие (3 600₽) — действует 4 недели",
        callback_data: "buy_3600_personal_spbhkc",
      },
    ],
  },
  ds: [
    {
      text: "12 занятий (9 600₽) — действует 6 недель",
      callback_data: "buy_9600_ds",
    },
    {
      text: "36 занятий (23 400₽) — действует 14 недель",
      callback_data: "buy_23400_ds",
    },
  ],
};

// Создаем экземпляр бота
const bot = new Bot(process.env.BOT_API_KEY); // Ваш API ключ от Telegram бота

// Функция для проверки наличия пользователя в Airtable
async function checkUserInAirtable(tgId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_TABLE_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula={tgId}='${tgId}'`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const response = await axios.get(url, { headers });
    console.log(
      `Результат проверки пользователя: ${response.data.records.length > 0}`
    );
    return response.data.records.length > 0; // Если записи найдены, возвращаем true
  } catch (error) {
    console.error(
      "Error checking user in Airtable:",
      error.response ? error.response.data : error.message
    );
    return false; // В случае ошибки также возвращаем false
  }
}

// Функция для генерации уникального ID в допустимом диапазоне
function generateUniqueId() {
  const maxId = 2147483647; // Максимально допустимое значение
  const minId = 1; // Минимально допустимое значение
  return (Date.now() % (maxId - minId + 1)) + minId;
}

// Функция для генерации ссылки на оплату
function generatePaymentLink(paymentId, sum, email) {
  const shopId = process.env.ROBO_ID; // Логин вашего магазина в Робокассе
  const secretKey1 = process.env.ROBO_SECRET1; // Secret Key 1 для формирования подписи

  const signature = crypto
    .createHash("md5")
    .update(`${shopId}:${sum}:${paymentId}:${secretKey1}`)
    .digest("hex");

  return `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${shopId}&OutSum=${sum}&InvId=${paymentId}&SignatureValue=${signature}&Email=${encodeURIComponent(
    email
  )}&IsTest=0`; // Используйте https://auth.robokassa.ru/ для продакшена
}

// Функция для получения информации о пользователе из Airtable
async function getUserInfo(tgId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_TABLE_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula={tgId}='${tgId}'`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const records = response.data.records;

    if (records.length > 0) {
      const email = records[0].fields.email || "нет email"; // Если email отсутствует, выводим сообщение
      const tag = records[0].fields.Tag || "неизвестен"; // Если тег отсутствует, выводим "неизвестен"
      return { email, tag };
    } else {
      return null; // Если запись не найдена, возвращаем null
    }
  } catch (error) {
    console.error(
      "Error fetching user info from Airtable:",
      error.response ? error.response.data : error.message
    );
    return null; // В случае ошибки возвращаем null
  }
}

// Функция для получения баланса и валюты из Airtable
async function getUserBalanceAndCurrency(tgId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_TABLE_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula={tgId}='${tgId}'`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const records = response.data.records;

    if (records.length > 0) {
      const balance =
        records[0].fields.Balance !== undefined
          ? records[0].fields.Balance
          : "0";
      const currency = records[0].fields.Currency || "неизвестна"; // Если валюты нет, выводим "неизвестна"
      return { balance, currency };
    } else {
      return null; // Если запись не найдена, возвращаем null
    }
  } catch (error) {
    console.error(
      "Error fetching user balance and currency from Airtable:",
      error.response ? error.response.data : error.message
    );
    return null; // В случае ошибки возвращаем null
  }
}

// Функция для отправки данных в Airtable
async function sendToAirtable(tgId, invId, sum, lessons, tag) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const purchasId = process.env.AIRTABLE_PURCHAS_ID;

  const url = `https://api.airtable.com/v0/${baseId}/${purchasId}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const data = {
    fields: {
      tgId: tgId,
      inv_id: invId,
      Sum: sum,
      Lessons: lessons,
      Tag: tag,
    },
  };

  try {
    await axios.post(url, data, { headers });
  } catch (error) {
    console.error(
      "Error sending data to Airtable:",
      error.response ? error.response.data : error.message
    );
  }
}

// Функция для генерации клавиатуры на основе тега пользователя
function generateKeyboard(tag) {
  let keyboard = new InlineKeyboard();
  console.log("Отправляю кнопки для оплаты");
  if (tag === "MSC_group_YCG") {
    buttonsData.group.MSCYCG.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_group_SPI") {
    buttonsData.group.SPBSPI.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_group_RTC") {
    buttonsData.group.SPBRTC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_group_HKC") {
    buttonsData.group.SPBHKC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "MSC_personal_YCG") {
    buttonsData.personal.MSCYCG.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_personal_SPI") {
    buttonsData.personal.SPBSPI.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_personal_RTC") {
    buttonsData.personal.SPBRTC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "SPB_personal_HKC") {
    buttonsData.personal.SPBHKC.forEach((button) => keyboard.add(button).row());
  } else if (tag === "ds") {
    buttonsData.ds.forEach((button) => keyboard.add(button).row());
  } else {
    // Если тег не распознан, возвращаем null
    return null;
  }
  return keyboard;
}

// Создаем и настраиваем Express-приложение
const app = express();
app.use(bodyParser.json()); // Используем JSON для обработки запросов от Telegram и Робокассы

// Обработчик команд бота
bot.command("start", async (ctx) => {
  const user = ctx.from;
  console.log("Новый пользователь:");
  console.log(`ID: ${user.id}`);
  console.log(`Имя: ${user.first_name}`);
  console.log(`Фамилия: ${user.last_name || "не указана"}`);
  console.log(`Ник: ${user.username || "не указан"}`);

  console.log(`Команда /start от пользователя: ${user.id}`);

  const tgId = ctx.from.id; // Сохранение tgId пользователя

  // Проверка наличия пользователя в Airtable
  const userExists = await checkUserInAirtable(tgId);

  if (!userExists) {
    // Если пользователя нет в базе, отправляем сообщение об отказе в доступе
    await ctx.reply(
      "Извините, доступ закрыт. Обратитесь, пожалуйста, к нашему менеджеру за поддержкой: @IDC_Manager"
    );
    return; // Завершаем выполнение команды
  }

  // Если пользователь найден, продолжаем выполнение команды start
  try {
    const userInfo = await getUserInfo(tgId);
    if (userInfo) {
      const { tag } = userInfo;

      if (tag.includes("ds")) {
        console.log("получил кнопки меню (ds)");
        const keyboard = new Keyboard()
          .text("Узнать баланс")
          .text("Купить онлайн тренировки");
        await ctx.reply("Привет! Выберите, что вас интересует:", {
          reply_markup: { keyboard: keyboard.build(), resize_keyboard: true },
        });
      } else if (tag.includes("group")) {
        console.log("получил кнопки меню (group)");
        const keyboard = new Keyboard()
          .text("Узнать баланс")
          .text("Купить групповые тренировки");
        await ctx.reply("Привет! Выберите, что вас интересует:", {
          reply_markup: { keyboard: keyboard.build(), resize_keyboard: true },
        });
      } else if (tag.includes("personal")) {
        console.log("получил кнопки меню (personal)");
        const keyboard = new Keyboard()
          .text("Узнать баланс")
          .text("Купить персональные тренировки");
        await ctx.reply("Привет! Выберите, что вас интересует:", {
          reply_markup: { keyboard: keyboard.build(), resize_keyboard: true },
        });
      }
    }
  } catch (error) {
    console.error("Произошла ошибка:", error);
  }
});

// Обработчик для текстовых сообщений и команд
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim().toLowerCase();

  // Если сообщение начинается с '/', это команда, и мы её обрабатываем отдельно
  if (text.startsWith("/")) {
    switch (text) {
      case "/group":
        console.log("Переключил на /group");
        await ctx.reply("Переключено на групповые тренировки.", {
          reply_markup: {
            keyboard: new Keyboard()
              .text("Узнать баланс")
              .text("Купить групповые тренировки")
              .build(),
            resize_keyboard: true,
          },
        });
        break;
      case "/personal":
        console.log("Переключил на /personal");
        await ctx.reply("Переключено на персональные тренировки.", {
          reply_markup: {
            keyboard: new Keyboard()
              .text("Узнать баланс")
              .text("Купить персональные тренировки")
              .build(),
            resize_keyboard: true,
          },
        });
        break;
      case "/online":
        console.log("Переключил на /online");
        await ctx.reply("Переключено на онлайн тренировки.", {
          reply_markup: {
            keyboard: new Keyboard()
              .text("Узнать баланс")
              .text("Купить онлайн тренировки")
              .build(),
            resize_keyboard: true,
          },
        });
        break;
      case "/operator":
        console.log("Вызвал /operator");
        await ctx.reply(
          "Если у вас остались вопросы, вы можете написать нашему менеджеру Никите: @IDC_Manager, он подскажет 😉"
        );
        break;
      default:
        await ctx.reply("Неизвестная команда. Попробуйте снова.");
    }
    return; // Завершаем обработку, чтобы не продолжать ниже
  }

  // Обработчик для кнопки "Купить тренировки"
  if (text === "купить групповые тренировки") {
    const tgId = ctx.from.id;
    const userInfo = await getUserInfo(tgId);
    console.log("Нажал купить групповые тренировки");

    if (userInfo) {
      const newString = userInfo.tag
        .replace("personal", "group")
        .replace("ds", "dd");
      const keyboard = generateKeyboard(newString);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке."
        );
      }
    } else {
      await ctx.reply(
        "Не удалось получить информацию о вашем теге. Пожалуйста, попробуйте позже."
      );
    }
  } else if (text === "купить персональные тренировки") {
    const tgId = ctx.from.id;
    const userInfo = await getUserInfo(tgId);
    console.log("нажал купить персональные тренировки");
    if (userInfo) {
      const newString = userInfo.tag
        .replace("group", "personal")
        .replace("ds", "dd");
      const keyboard = generateKeyboard(newString);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке."
        );
      }
    } else {
      await ctx.reply(
        "Не удалось получить информацию о вашем теге. Пожалуйста, попробуйте позже."
      );
    }
  } else if (text === "купить онлайн тренировки") {
    const tgId = ctx.from.id;
    const userInfo = await getUserInfo(tgId);
    console.log("нажал купить онлайн тренировки");

    if (userInfo) {
      const newString = userInfo.tag.replace(userInfo.tag, "ds");
      const keyboard = generateKeyboard(newString);
      if (keyboard) {
        await ctx.reply("Выберите тариф:", {
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(
          "Ваш тег не распознан. Пожалуйста, обратитесь к поддержке @IDC_Manager."
        );
      }
    } else {
      await ctx.reply(
        "Не удалось получить информацию о вашем теге. Пожалуйста, попробуйте позже."
      );
    }
  } else if (text === "узнать баланс") {
    console.log("Нажал кнопку Узнать баланс");
    const tgId = ctx.from.id;
    const result = await getUserBalanceAndCurrency(tgId);

    if (result !== null) {
      await ctx.reply(
        `Ваш текущий баланс: ${result.balance} ${result.currency}`
      );
    } else {
      await ctx.reply(
        "Не удалось получить информацию о балансе. Пожалуйста, попробуйте позже."
      );
    }
  }
});

// Обработчик для выбора тренировки и генерации ссылки на оплату
bot.on("callback_query", async (ctx) => {
  const action = ctx.callbackQuery.data;
  const tgId = ctx.from.id;

  const userInfo = await getUserInfo(tgId);
  if (!userInfo) {
    await ctx.answerCallbackQuery({
      text: "Не удалось получить информацию о пользователе.",
    });
    return;
  }

  const { email } = userInfo;
  const data = actionData[action];

  if (data) {
    const paymentId = generateUniqueId();
    const paymentLink = generatePaymentLink(paymentId, data.sum, email);
    await ctx.reply(`Отлично! Перейдите по ссылке для оплаты: ${paymentLink}`);

    // Отправка данных в Airtable с inv_id
    await sendToAirtable(tgId, paymentId, data.sum, data.lessons, data.tag);

    await ctx.answerCallbackQuery();
  } else {
    await ctx.answerCallbackQuery({
      text: "Неверный выбор. Пожалуйста, попробуйте снова.",
    });
  }
});

// Запуск бота
bot.start();
