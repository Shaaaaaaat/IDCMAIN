const { assertYooKassaConfig } = require("./yookassa");

function getUseYooKassa() {
  const raw = process.env.USE_YOOKASSA;
  const normalized = raw == null ? "" : String(raw).trim();

  if (!normalized || normalized === "0") {
    return false;
  }

  if (normalized === "1") {
    assertYooKassaConfig();
    return true;
  }

  throw new Error("Invalid USE_YOOKASSA value. Expected 0 or 1.");
}

function resolveTelegramPaymentProvider(paymentSystem) {
  if (paymentSystem !== "robokassa") {
    return paymentSystem;
  }

  return getUseYooKassa() ? "yookassa" : "robokassa";
}

module.exports = {
  getUseYooKassa,
  resolveTelegramPaymentProvider,
};
