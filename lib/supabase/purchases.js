const {
  SUPABASE_LOG_TAG,
  isSupabasePurchasesWriteEnabled,
  getSupabasePurchasesEnvDiag,
  getSupabaseServerClient,
} = require("./server");
const crypto = require("crypto");

function normalizeIdPayment(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeNullableString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizePersonName(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized || /^\d+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function redactLogText(value) {
  const text = String(value == null ? "" : value);
  return (text.length > 400 ? `${text.slice(0, 400)}...` : text)
    .replace(/bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|key|signature|SignatureValue|Receipt)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(Authorization\s*:\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function maskLogValue(value, prefix) {
  const raw = normalizeNullableString(value);
  if (!raw) return null;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 10);
  return `${prefix}_${hash}`;
}

function safePaymentId(value) {
  return maskLogValue(value, "pay");
}

function safeTgId(value) {
  return maskLogValue(value, "tg");
}

function toPostgrestError(error) {
  return {
    message: error?.message ? redactLogText(error.message) : null,
    code: error?.code || null,
    details: error?.details ? redactLogText(error.details) : null,
    hint: error?.hint ? redactLogText(error.hint) : null,
  };
}

function buildPurchasePayload(input, fallbackStatus = "Created") {
  const purchaseSum = Number(input?.purchaseSum);
  const lessonsNumber = Number(input?.lessons);
  const pricePerLessonNumber = Number(input?.pricePerLesson);
  const tgidNumber =
    input?.tgid == null || input?.tgid === ""
      ? null
      : Number.isFinite(Number(input.tgid))
        ? Number(input.tgid)
        : null;

  const payload = {
    source_channel: normalizeNullableString(input?.sourceChannel),
    payment_provider: normalizeNullableString(input?.paymentProvider),
    email: normalizeNullableString(input?.email),
    fi: normalizePersonName(input?.fi),
    tgid: tgidNumber,
    gift_recipient: normalizeNullableString(input?.giftRecipient),
    tg_link_token: normalizeNullableString(input?.tgLinkToken),
    created_time: normalizeNullableString(input?.createdTime),
    sum: Number.isFinite(purchaseSum) ? purchaseSum : null,
    currency: normalizeNullableString(input?.currency),
    lessons: Number.isFinite(lessonsNumber) ? lessonsNumber : null,
    price_per_lesson: Number.isFinite(pricePerLessonNumber)
      ? pricePerLessonNumber
      : null,
    id_payment: normalizeIdPayment(input?.idPayment),
    status: normalizeNullableString(input?.status) || fallbackStatus,
    course_name: normalizeNullableString(input?.courseName),
    tag: normalizeNullableString(input?.tag),
    nickname: normalizeNullableString(input?.nickname),
    phone: normalizeNullableString(input?.phone),
    tariff_label: normalizeNullableString(input?.tariffLabel),
    studio_slug: normalizeNullableString(input?.studioSlug),
    slot_start_at: normalizeNullableString(input?.slotStartAt),
    format: normalizeNullableString(input?.format),
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== "")
  );
}

async function upsertPurchaseCreated(input) {
  const idPayment = normalizeIdPayment(input?.idPayment);
  if (!idPayment) {
    console.warn(`[${SUPABASE_LOG_TAG}] upsert_created_skipped`, {
      reason: "missing_id_payment",
    });
    return { ok: false, reason: "missing_id_payment" };
  }

  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    console.log(`[${SUPABASE_LOG_TAG}] upsert_created_skipped`, {
      id_payment: safePaymentId(idPayment),
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] upsert_created_skipped`, {
      id_payment: safePaymentId(idPayment),
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  console.log(`[${SUPABASE_LOG_TAG}] upsert_created_start`, {
    id_payment: safePaymentId(idPayment),
  });

  let existingRow = null;
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("id,status")
      .eq("id_payment", idPayment)
      .maybeSingle();
    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] upsert_created_lookup_error`, {
        id_payment: safePaymentId(idPayment),
        error: toPostgrestError(error),
      });
    } else {
      existingRow = data || null;
    }
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] upsert_created_lookup_error`, {
      id_payment: safePaymentId(idPayment),
      error: toPostgrestError(error),
    });
  }

  const currentStatus = String(existingRow?.status || "");
  const hasTerminalStatus =
    currentStatus.toLowerCase() === "paid" ||
    currentStatus.toLowerCase() === "matched";

  const payload = buildPurchasePayload(
    {
      ...input,
      idPayment,
      status: hasTerminalStatus ? currentStatus : "Created",
    },
    "Created"
  );

  try {
    const { data, error } = await supabase
      .from("purchases")
      .upsert(payload, { onConflict: "id_payment" })
      .select("id,status")
      .maybeSingle();

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] upsert_created_upsert_error`, {
        id_payment: safePaymentId(idPayment),
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "upsert_error" };
    }

    if (hasTerminalStatus) {
      console.log(`[${SUPABASE_LOG_TAG}] upsert_created_skipped`, {
        id_payment: safePaymentId(idPayment),
        reason: "terminal_status_preserved",
        status: currentStatus,
      });
    } else {
      console.log(`[${SUPABASE_LOG_TAG}] upsert_created_ok`, {
        id_payment: safePaymentId(idPayment),
        purchase_id: data?.id || existingRow?.id || null,
        status: data?.status || "Created",
      });
    }
    return {
      ok: true,
      purchaseId: data?.id || existingRow?.id || null,
      status: data?.status || payload.status || null,
      preservedTerminalStatus: hasTerminalStatus,
    };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] upsert_created_upsert_error`, {
      id_payment: safePaymentId(idPayment),
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "upsert_exception" };
  }
}

async function createYooKassaPurchaseCreated(input) {
  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    console.log(`[${SUPABASE_LOG_TAG}] yookassa_create_skipped`, {
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] yookassa_create_skipped`, {
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  const payload = buildPurchasePayload(
    {
      ...input,
      idPayment: null,
      status: "Created",
      paymentProvider: "yookassa",
    },
    "Created"
  );

  try {
    const { data, error } = await supabase
      .from("purchases")
      .insert(payload)
      .select("id,status")
      .single();

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] yookassa_create_error`, {
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "insert_error" };
    }

    console.log(`[${SUPABASE_LOG_TAG}] yookassa_create_ok`, {
      purchase_id: data?.id || null,
      status: data?.status || "Created",
    });

    return {
      ok: true,
      purchaseId: data?.id || null,
      status: data?.status || "Created",
    };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] yookassa_create_error`, {
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "insert_exception" };
  }
}

async function attachYooKassaPaymentId({
  purchaseId,
  paymentId,
}) {
  const normalizedPurchaseId = normalizeNullableString(purchaseId);
  const normalizedPaymentId = normalizeIdPayment(paymentId);
  if (!normalizedPurchaseId || !normalizedPaymentId) {
    return { ok: false, reason: "missing_purchase_or_payment_id" };
  }

  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    console.log(`[${SUPABASE_LOG_TAG}] yookassa_attach_skipped`, {
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] yookassa_attach_skipped`, {
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  try {
    const { data: existing, error: lookupError } = await supabase
      .from("purchases")
      .select("id,id_payment,status,payment_provider")
      .eq("id", normalizedPurchaseId)
      .maybeSingle();

    if (lookupError) {
      console.error(`[${SUPABASE_LOG_TAG}] yookassa_attach_lookup_error`, {
        purchase_id: normalizedPurchaseId,
        error: toPostgrestError(lookupError),
      });
      return { ok: false, reason: "lookup_error" };
    }

    if (!existing?.id) {
      return { ok: false, reason: "purchase_not_found" };
    }

    if (existing.payment_provider !== "yookassa") {
      return { ok: false, reason: "payment_provider_mismatch" };
    }

    if (existing.id_payment && existing.id_payment !== normalizedPaymentId) {
      return { ok: false, reason: "payment_id_mismatch" };
    }

    if (existing.id_payment === normalizedPaymentId) {
      return {
        ok: true,
        purchaseId: existing.id,
        idPayment: existing.id_payment,
        status: existing.status || null,
      };
    }

    const { data: updated, error } = await supabase
      .from("purchases")
      .update({ id_payment: normalizedPaymentId })
      .eq("id", normalizedPurchaseId)
      .eq("payment_provider", "yookassa")
      .is("id_payment", null)
      .select("id,id_payment,status,payment_provider")
      .maybeSingle();

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] yookassa_attach_error`, {
        purchase_id: normalizedPurchaseId,
        id_payment: safePaymentId(normalizedPaymentId),
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "update_error" };
    }

    if (updated?.id && updated.id_payment === normalizedPaymentId) {
      return {
        ok: true,
        purchaseId: updated.id,
        idPayment: updated.id_payment,
        status: updated.status || null,
      };
    }

    const { data: reread, error: rereadError } = await supabase
      .from("purchases")
      .select("id,id_payment,status,payment_provider")
      .eq("id", normalizedPurchaseId)
      .maybeSingle();

    if (rereadError) {
      console.error(`[${SUPABASE_LOG_TAG}] yookassa_attach_reread_error`, {
        purchase_id: normalizedPurchaseId,
        id_payment: safePaymentId(normalizedPaymentId),
        error: toPostgrestError(rereadError),
      });
      return { ok: false, reason: "reread_error" };
    }

    if (reread?.payment_provider === "yookassa" && reread.id_payment === normalizedPaymentId) {
      return {
        ok: true,
        purchaseId: reread.id,
        idPayment: reread.id_payment,
        status: reread.status || null,
      };
    }

    return { ok: false, reason: "payment_id_not_attached" };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] yookassa_attach_error`, {
      purchase_id: normalizedPurchaseId,
      id_payment: safePaymentId(normalizedPaymentId),
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "update_exception" };
  }
}

async function confirmYooKassaPurchase({
  purchaseId,
  paymentId,
  amount,
  currency,
  shopId,
  expectedShopId,
  status,
}) {
  const normalizedPurchaseId = normalizeNullableString(purchaseId);
  const normalizedPaymentId = normalizeIdPayment(paymentId);
  if (!normalizedPurchaseId || !normalizedPaymentId) {
    return { ok: false, reason: "missing_purchase_or_payment_id" };
  }

  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    console.log(`[${SUPABASE_LOG_TAG}] yookassa_confirm_skipped`, {
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] yookassa_confirm_skipped`, {
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  try {
    const { data, error } = await supabase.rpc("confirm_yookassa_purchase", {
      p_purchase_id: normalizedPurchaseId,
      p_payment_id: normalizedPaymentId,
      p_amount: normalizeNullableString(amount),
      p_currency: normalizeNullableString(currency),
      p_shop_id: normalizeNullableString(shopId),
      p_expected_shop_id: normalizeNullableString(expectedShopId),
      p_yookassa_status: normalizeNullableString(status),
    });

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] yookassa_confirm_rpc_error`, {
        purchase_id: normalizedPurchaseId,
        id_payment: safePaymentId(normalizedPaymentId),
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "rpc_error" };
    }

    if (data && data.ok === false) {
      return { ok: false, reason: "rpc_not_ok", data };
    }

    return { ok: true, data };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] yookassa_confirm_rpc_error`, {
      purchase_id: normalizedPurchaseId,
      id_payment: safePaymentId(normalizedPaymentId),
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "rpc_exception" };
  }
}

async function markPurchasePaidAndProcess(idPaymentRaw) {
  const idPayment = normalizeIdPayment(idPaymentRaw);
  if (!idPayment) {
    console.warn(`[${SUPABASE_LOG_TAG}] mark_paid_skipped`, {
      reason: "missing_id_payment",
    });
    return { ok: false, reason: "missing_id_payment" };
  }

  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    console.log(`[${SUPABASE_LOG_TAG}] mark_paid_skipped`, {
      id_payment: safePaymentId(idPayment),
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] mark_paid_skipped`, {
      id_payment: safePaymentId(idPayment),
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  console.log(`[${SUPABASE_LOG_TAG}] mark_paid_start`, {
    id_payment: safePaymentId(idPayment),
  });

  let purchase = null;
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("id,status")
      .eq("id_payment", idPayment)
      .maybeSingle();
    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] mark_paid_lookup_error`, {
        id_payment: safePaymentId(idPayment),
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "lookup_error" };
    }
    purchase = data || null;
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] mark_paid_lookup_error`, {
      id_payment: safePaymentId(idPayment),
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "lookup_exception" };
  }

  if (!purchase?.id) {
    console.warn(`[${SUPABASE_LOG_TAG}] mark_paid_not_found`, {
      id_payment: safePaymentId(idPayment),
    });
    return { ok: false, reason: "purchase_not_found" };
  }

  const purchaseId = String(purchase.id);
  const currentStatus = String(purchase.status || "");
  if (currentStatus.toLowerCase() !== "paid") {
    try {
      const { error } = await supabase
        .from("purchases")
        .update({ status: "Paid" })
        .eq("id", purchaseId);
      if (error) {
        console.error(`[${SUPABASE_LOG_TAG}] mark_paid_update_error`, {
          id_payment: safePaymentId(idPayment),
          purchase_id: purchaseId,
          error: toPostgrestError(error),
        });
        return { ok: false, reason: "update_error" };
      }
      console.log(`[${SUPABASE_LOG_TAG}] mark_paid_status_updated`, {
        id_payment: safePaymentId(idPayment),
        purchase_id: purchaseId,
      });
    } catch (error) {
      console.error(`[${SUPABASE_LOG_TAG}] mark_paid_update_error`, {
        id_payment: safePaymentId(idPayment),
        purchase_id: purchaseId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "update_exception" };
    }
  } else {
    console.log(`[${SUPABASE_LOG_TAG}] mark_paid_status_updated`, {
      id_payment: safePaymentId(idPayment),
      purchase_id: purchaseId,
      note: "already_paid",
    });
  }

  try {
    const { error } = await supabase.rpc("process_paid_purchase", {
      p_purchase_id: purchaseId,
    });
    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] mark_paid_rpc_error`, {
        id_payment: safePaymentId(idPayment),
        purchase_id: purchaseId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "rpc_error" };
    }
    console.log(`[${SUPABASE_LOG_TAG}] mark_paid_rpc_ok`, {
      id_payment: safePaymentId(idPayment),
      purchase_id: purchaseId,
    });
    return { ok: true, purchaseId };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] mark_paid_rpc_error`, {
      id_payment: safePaymentId(idPayment),
      purchase_id: purchaseId,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "rpc_exception" };
  }
}

async function matchPurchaseByTgTokenShadow({
  token,
  tgid,
  username = null,
}) {
  const normalizedToken = normalizeNullableString(token);
  const normalizedTgid = normalizeNullableString(tgid);
  const normalizedUsername = normalizeNullableString(username);

  if (!normalizedToken || !normalizedTgid) {
    console.warn(`[${SUPABASE_LOG_TAG}] token_match_skipped`, {
      reason: "missing_token_or_tgid",
    });
    return { ok: false, reason: "missing_token_or_tgid" };
  }

  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    console.log(`[${SUPABASE_LOG_TAG}] token_match_skipped`, {
      reason: "feature_disabled",
      env: envDiag,
      p_tgid: safeTgId(normalizedTgid),
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] token_match_skipped`, {
      reason: "client_unavailable",
      env: envDiag,
      p_tgid: safeTgId(normalizedTgid),
    });
    return { ok: false, reason: "client_unavailable" };
  }

  try {
    console.log(`[${SUPABASE_LOG_TAG}] token_match_start`, {
      p_tgid: safeTgId(normalizedTgid),
    });
    const { data, error } = await supabase.rpc("match_purchase_by_tg_token", {
      p_token: normalizedToken,
      p_tgid: normalizedTgid,
      p_username: normalizedUsername,
    });

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] token_match_rpc_error`, {
        p_tgid: safeTgId(normalizedTgid),
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "rpc_error" };
    }

    console.log(`[${SUPABASE_LOG_TAG}] token_match_rpc_ok`, {
      p_tgid: safeTgId(normalizedTgid),
      has_data: data != null,
    });
    return { ok: true, data };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] token_match_rpc_error`, {
      p_tgid: safeTgId(normalizedTgid),
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "rpc_exception" };
  }
}

module.exports = {
  upsertPurchaseCreated,
  createYooKassaPurchaseCreated,
  attachYooKassaPaymentId,
  confirmYooKassaPurchase,
  markPurchasePaidAndProcess,
  matchPurchaseByTgTokenShadow,
  normalizePersonName,
};
