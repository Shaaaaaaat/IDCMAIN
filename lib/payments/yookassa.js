const axios = require("axios");

const YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";

function normalizeEnvString(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function getYooKassaConfig() {
  return {
    shopId: normalizeEnvString(process.env.YOOKASSA_SHOP_ID),
    secretKey: normalizeEnvString(process.env.YOOKASSA_SECRET_KEY),
    returnUrl: normalizeEnvString(process.env.YOOKASSA_RETURN_URL),
  };
}

function assertYooKassaConfig(options = {}) {
  const { requireReturnUrl = true } = options;
  const config = getYooKassaConfig();
  const missing = [];
  if (!config.shopId) missing.push("YOOKASSA_SHOP_ID");
  if (!config.secretKey) missing.push("YOOKASSA_SECRET_KEY");
  if (requireReturnUrl && !config.returnUrl) missing.push("YOOKASSA_RETURN_URL");

  if (missing.length > 0) {
    throw new Error(`Missing YooKassa configuration: ${missing.join(", ")}`);
  }

  return config;
}

function buildYooKassaAuth(config) {
  return {
    username: config.shopId,
    password: config.secretKey,
  };
}

function formatAmountValue(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Некорректная сумма для YooKassa");
  }
  return value.toFixed(2);
}

function normalizeDescription(value) {
  const text = String(value || "Тренировка по калистенике")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "Тренировка по калистенике").slice(0, 128);
}

async function createYooKassaPayment({
  purchaseId,
  amount,
  description,
}) {
  const config = assertYooKassaConfig({ requireReturnUrl: true });
  const idempotenceKey = String(purchaseId || "").trim();
  if (!idempotenceKey) {
    throw new Error("YooKassa purchaseId is required");
  }

  const body = {
    amount: {
      value: formatAmountValue(amount),
      currency: "RUB",
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: config.returnUrl,
    },
    description: normalizeDescription(description),
    metadata: {
      orderId: idempotenceKey,
    },
  };

  const { data } = await axios.post(`${YOOKASSA_API_BASE}/payments`, body, {
    auth: buildYooKassaAuth(config),
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
    },
    timeout: 20000,
  });

  return data;
}

async function getYooKassaPayment(paymentId) {
  const config = assertYooKassaConfig({ requireReturnUrl: false });
  const normalizedPaymentId = String(paymentId || "").trim();
  if (!normalizedPaymentId) {
    throw new Error("YooKassa paymentId is required");
  }

  const { data } = await axios.get(
    `${YOOKASSA_API_BASE}/payments/${encodeURIComponent(normalizedPaymentId)}`,
    {
      auth: buildYooKassaAuth(config),
      timeout: 20000,
    }
  );

  return data;
}

module.exports = {
  getYooKassaConfig,
  assertYooKassaConfig,
  createYooKassaPayment,
  getYooKassaPayment,
  formatAmountValue,
};
