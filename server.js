require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { Bot } = require("grammy");
const connectDB = require("./database");
const Session = require("./sessionModel");

// Создаем экземпляр бота
const bot = new Bot(process.env.BOT_API_KEY);

// Подключаемся к MongoDB
connectDB();

// Создаем экземпляр Express
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Обработка запросов от Робокассы
app.post("/webhook/robokassa", async (req, res) => {
  const { InvId, OutSum, SignatureValue, Status } = req.body;

  // Проверьте подпись для подтверждения подлинности уведомления
  const expectedSignature = crypto
    .createHash("md5")
    .update(`${OutSum}:${InvId}:${process.env.ROBO_SECRET}`)
    .digest("hex");

  if (SignatureValue !== expectedSignature) {
    return res.status(400).send("Invalid signature");
  }

  // Найдите сессию в базе данных по InvId
  const session = await Session.findOne({ paymentId: InvId });

  if (session) {
    // Обновите статус оплаты в базе данных
    if (Status === "Success") {
      session.paymentStatus = "success";
      await bot.api.sendMessage(session.userId, "Оплата прошла успешно");
    } else {
      session.paymentStatus = "failed";
      await bot.api.sendMessage(
        session.userId,
        "Оплата не прошла. Попробуйте снова."
      );
    }
    await session.save();
  } else {
    await bot.api.sendMessage(session.userId, "Не удалось подтвердить оплату");
  }

  res.status(200).send("OK");
});

// Запуск сервера
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
