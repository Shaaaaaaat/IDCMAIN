function toTrimmedString(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeLower(value) {
  return toTrimmedString(value).toLowerCase();
}

function normalizeMessageStudioId(studioId) {
  const normalized = toTrimmedString(studioId);
  return normalized === "spb_hkc" ? "spb_hellskitchen" : normalized;
}

function resolvePurchaseMessageStudioId(
  purchase,
  resolveOfflineStudioIdForPurchase,
  gymStudioMeta
) {
  const studioSlug = toTrimmedString(purchase?.studio_slug);
  const directStudioId = normalizeMessageStudioId(studioSlug);
  if (
    directStudioId &&
    gymStudioMeta &&
    Object.prototype.hasOwnProperty.call(gymStudioMeta, directStudioId)
  ) {
    return directStudioId;
  }

  const fallbackStudioId = typeof resolveOfflineStudioIdForPurchase === "function"
    ? resolveOfflineStudioIdForPurchase(
        studioSlug,
        toTrimmedString(purchase?.tag) || toTrimmedString(purchase?.course_name)
      )
    : "";

  return normalizeMessageStudioId(fallbackStudioId);
}

function formatPurchaseTokenFlowData({
  purchase,
  formatSlotStartDate,
  resolveOfflineStudioIdForPurchase,
  gymStudioMeta,
}) {
  const formatRaw = purchase?.format;
  const formatValue = Array.isArray(formatRaw)
    ? normalizeLower(formatRaw[0])
    : normalizeLower(formatRaw);

  const studioId = resolvePurchaseMessageStudioId(
    purchase,
    resolveOfflineStudioIdForPurchase,
    gymStudioMeta
  );

  return {
    fio: toTrimmedString(purchase?.fi) || "друг",
    sum: purchase?.sum,
    currency: purchase?.currency,
    email: toTrimmedString(purchase?.email),
    formatValue,
    studioId,
    firstWorkoutDate: typeof formatSlotStartDate === "function"
      ? formatSlotStartDate(purchase?.slot_start_at)
      : "",
  };
}

async function maybeSendAdminFollowUp({
  ctx,
  purchase,
  sendAdminFollowUp,
  logError,
}) {
  if (typeof sendAdminFollowUp !== "function") return;

  try {
    await sendAdminFollowUp({
      ctx,
      purchase,
      username: ctx?.from?.username || null,
      tgId: ctx?.from?.id,
    });
  } catch (error) {
    if (typeof logError === "function") {
      logError("telegram_purchase_link_admin_follow_up_failed", error);
    } else {
      console.error("telegram_purchase_link_admin_follow_up_failed");
    }
  }
}

async function sendPurchaseSuccessMessages({
  ctx,
  purchaseData,
  InlineKeyboard,
  gymStudioMeta,
  formatMoney,
  logError,
}) {
  const {
    fio,
    sum,
    currency,
    formatValue,
    studioId,
    firstWorkoutDate,
  } = purchaseData;

  if (formatValue === "gym") {
    const meta = gymStudioMeta?.[studioId] || null;
    const studioName = meta?.name || "нашей студии";
    const studioAddress = meta?.address || "Адрес и детали будут отправлены менеджером.";
    const trainerName = meta?.trainer || "тренер";
    const dateLine = firstWorkoutDate
      ? `${firstWorkoutDate} состоится ваша первая тренировка в формате I Do Calisthenics.`
      : "Скоро состоится ваша первая тренировка в формате I Do Calisthenics.";

    if (studioId === "msk_youcan") {
      try {
        await ctx.reply(
          `<b>Пока хорошая погода, тренировки проходят на открытом воздухе в парке Лужники.</b>\n\nНедалеко от канатной дороги: <a href="https://yandex.com/maps/213/moscow/?ll=37.553657%2C55.713098&mode=poi&poi%5Bpoint%5D=37.553265%2C55.713200&poi%5Buri%5D=ymapsbm1%3A%2F%2Forg%3Foid%3D100342209253&z=19">улица Лужники, 24с59</a>`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }
        );
      } catch (error) {
        if (typeof logError === "function") {
          logError("youcan_outdoor_message_failed", error);
        }
      }
    }

    await ctx.reply(
      `Ура, ${fio}, оплата прошла успешно!\n${dateLine}\n\nЗал называется ${studioName} и находится по адресу:\n${studioAddress}\n\nС собой берём удобную спортивную форму и бутылочку воды, также при необходимости принадлежности для душа.\n\nТренер ${trainerName} будет ждать вас в зале 😊`
    );
    await ctx.reply(
      "❗️ Важно: если вам нужно перенести пробную тренировку, воспользуйтесь командой /reschedule и выберите удобную дату.\n\nОбратите внимание: пройти тренировку необходимо в течение 4 недель после оплаты.\nЕсли вам нужно больше времени, вы можете написать нашему менеджеру Никите — @IDC_manager — и попросить продлить срок."
    );

    if (typeof InlineKeyboard === "function") {
      const gymKb = new InlineKeyboard();
      if (meta?.mapUrl) {
        gymKb.add({ text: "📍 Как добраться", url: meta.mapUrl });
      }
      if (meta?.chatUrl) {
        if (meta?.mapUrl) gymKb.row();
        gymKb.add({ text: "💬 Присоединиться к чату", url: meta.chatUrl });
      }
      if (meta?.mapUrl || meta?.chatUrl) {
        await ctx.reply("Полезные ссылки:", { reply_markup: gymKb });
      }
    }
    return;
  }

  if (formatValue === "ds") {
    await ctx.reply(
      "Ура, оплата прошла успешно!\n\nВскоре на вашу почту придет письмо с темой [TrueCoach] Invitation, содержащее приглашение для доступа к нашему приложению, где будет стоять первая тренировка.\n\nПосле прохождения первой тренировки наш тренер свяжется с вами и предоставит подробную обратную связь. Для удобства рекомендуем скачать мобильную версию приложения 👇🏻"
    );
    await ctx.reply(
      "Краткая инструкция как выполнять тест силы от I Do Calisthenics:\n\nВсего 5-7 упражнений (в зависимости от выбранного курса). Для каждого упражнения в приложении указано возможное количество вариаций (от 1 до 3): вам надо выбрать и выполнить только одну вариацию и один подход в каждом упражнении — ту, которая для вас не самая простая, но с которой вы уверенно справитесь.\n\nВажно: все упражнения необходимо снять на видео и загрузить в приложение — это поможет нам определить ваш текущий уровень и составить последующие тренировки эффективно.",
      {
        reply_markup: new InlineKeyboard()
          .add({
            text: "🍎 Скачать для iOS",
            url: "https://apps.apple.com/am/app/truecoach-for-clients/id1439127794",
          })
          .add({
            text: "🤖 Скачать для Android",
            url: "https://play.google.com/store/apps/details?id=co.truecoach.client",
          }),
      }
    );
    return;
  }

  const money = typeof formatMoney === "function"
    ? formatMoney(sum, currency)
    : `${sum || ""} ${currency || ""}`.trim();
  await ctx.reply(
    `Привет, ${fio}! ✅\nОплата подтверждена: ${money} зачислено на ваш счёт.\n\nМожешь продолжать — оплата уже отображается в системе.`
  );
}

async function handlePurchaseTokenFlow({
  ctx,
  token,
  lookupPurchaseByToken,
  matchPurchaseByTgToken,
  sendAdminFollowUp,
  InlineKeyboard,
  gymStudioMeta,
  formatSlotStartDate,
  formatMoney,
  resolveOfflineStudioIdForPurchase,
  logError,
}) {
  const normalizedToken = toTrimmedString(token);
  const currentTgId = toTrimmedString(ctx?.from?.id);

  const lookupResult = await lookupPurchaseByToken(normalizedToken);
  if (!lookupResult?.ok) {
    await ctx.reply(
      "Не удалось проверить оплату из-за технической ошибки. Попробуй ещё раз чуть позже или напиши в поддержку."
    );
    return { ok: false, reason: lookupResult?.reason || "lookup_failed" };
  }

  const purchase = lookupResult.data || null;
  if (!purchase) {
    await ctx.reply(
      "Не нашёл оплату по этой ссылке. Проверь, что ты открыл(а) ссылку со страницы оплаты. Если проблема повторяется — напиши в поддержку."
    );
    return { ok: false, reason: "not_found" };
  }

  if (normalizeLower(purchase.status) !== "paid") {
    await ctx.reply(
      "Оплата по этой ссылке ещё не подтверждена. Если ты только что оплатил(а), подожди пару минут и открой ссылку ещё раз."
    );
    return { ok: false, reason: "not_paid" };
  }

  const alreadyTgId = toTrimmedString(purchase.tgid);
  if (alreadyTgId && alreadyTgId !== currentTgId) {
    await ctx.reply(
      "Эта покупка уже привязана к другому аккаунту Telegram. Если это ошибка — напиши в поддержку."
    );
    return { ok: false, reason: "foreign_tgid" };
  }

  const matchResult = await matchPurchaseByTgToken({
    token: normalizedToken,
    tgid: currentTgId,
    username: ctx?.from?.username || null,
  });

  if (matchResult?.ok !== true || matchResult?.data?.ok !== true) {
    await ctx.reply(
      "Не удалось проверить оплату из-за технической ошибки. Попробуй ещё раз чуть позже или напиши в поддержку."
    );
    return { ok: false, reason: matchResult?.reason || "match_failed" };
  }

  const purchaseData = formatPurchaseTokenFlowData({
    purchase,
    formatSlotStartDate,
    resolveOfflineStudioIdForPurchase,
    gymStudioMeta,
  });

  await maybeSendAdminFollowUp({
    ctx,
    purchase,
    sendAdminFollowUp,
    logError,
  });

  await sendPurchaseSuccessMessages({
    ctx,
    purchaseData,
    InlineKeyboard,
    gymStudioMeta,
    formatMoney,
    logError,
  });

  return { ok: true, reason: "matched" };
}

module.exports = {
  handlePurchaseTokenFlow,
  normalizeMessageStudioId,
  resolvePurchaseMessageStudioId,
  formatPurchaseTokenFlowData,
};
