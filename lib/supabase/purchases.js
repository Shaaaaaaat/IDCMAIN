const {
  SUPABASE_LOG_TAG,
  isSupabasePurchasesWriteEnabled,
  getSupabasePurchasesEnvDiag,
  getSupabaseServerClient,
} = require("./server");

function normalizeIdPayment(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeNullableString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function toPostgrestError(error) {
  return {
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
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
    email: normalizeNullableString(input?.email),
    fi: normalizeNullableString(input?.fi),
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
    locale: normalizeNullableString(input?.locale),
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
      id_payment: idPayment,
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] upsert_created_skipped`, {
      id_payment: idPayment,
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  console.log(`[${SUPABASE_LOG_TAG}] upsert_created_start`, {
    id_payment: idPayment,
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
        id_payment: idPayment,
        error: toPostgrestError(error),
      });
    } else {
      existingRow = data || null;
    }
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] upsert_created_lookup_error`, {
      id_payment: idPayment,
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
        id_payment: idPayment,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "upsert_error" };
    }

    if (hasTerminalStatus) {
      console.log(`[${SUPABASE_LOG_TAG}] upsert_created_skipped`, {
        id_payment: idPayment,
        reason: "terminal_status_preserved",
        status: currentStatus,
      });
    } else {
      console.log(`[${SUPABASE_LOG_TAG}] upsert_created_ok`, {
        id_payment: idPayment,
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
      id_payment: idPayment,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "upsert_exception" };
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
      id_payment: idPayment,
      reason: "feature_disabled",
      env: envDiag,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] mark_paid_skipped`, {
      id_payment: idPayment,
      reason: "client_unavailable",
      env: envDiag,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  console.log(`[${SUPABASE_LOG_TAG}] mark_paid_start`, {
    id_payment: idPayment,
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
        id_payment: idPayment,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "lookup_error" };
    }
    purchase = data || null;
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] mark_paid_lookup_error`, {
      id_payment: idPayment,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "lookup_exception" };
  }

  if (!purchase?.id) {
    console.warn(`[${SUPABASE_LOG_TAG}] mark_paid_not_found`, {
      id_payment: idPayment,
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
          id_payment: idPayment,
          purchase_id: purchaseId,
          error: toPostgrestError(error),
        });
        return { ok: false, reason: "update_error" };
      }
      console.log(`[${SUPABASE_LOG_TAG}] mark_paid_status_updated`, {
        id_payment: idPayment,
        purchase_id: purchaseId,
      });
    } catch (error) {
      console.error(`[${SUPABASE_LOG_TAG}] mark_paid_update_error`, {
        id_payment: idPayment,
        purchase_id: purchaseId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "update_exception" };
    }
  } else {
    console.log(`[${SUPABASE_LOG_TAG}] mark_paid_status_updated`, {
      id_payment: idPayment,
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
        id_payment: idPayment,
        purchase_id: purchaseId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "rpc_error" };
    }
    console.log(`[${SUPABASE_LOG_TAG}] mark_paid_rpc_ok`, {
      id_payment: idPayment,
      purchase_id: purchaseId,
    });
    return { ok: true, purchaseId };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] mark_paid_rpc_error`, {
      id_payment: idPayment,
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
      p_tgid: normalizedTgid,
    });
    return { ok: false, reason: "feature_disabled" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[${SUPABASE_LOG_TAG}] token_match_skipped`, {
      reason: "client_unavailable",
      env: envDiag,
      p_tgid: normalizedTgid,
    });
    return { ok: false, reason: "client_unavailable" };
  }

  try {
    console.log(`[${SUPABASE_LOG_TAG}] token_match_start`, {
      p_tgid: normalizedTgid,
    });
    const { data, error } = await supabase.rpc("match_purchase_by_tg_token", {
      p_token: normalizedToken,
      p_tgid: normalizedTgid,
      p_username: normalizedUsername,
    });

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] token_match_rpc_error`, {
        p_tgid: normalizedTgid,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "rpc_error" };
    }

    console.log(`[${SUPABASE_LOG_TAG}] token_match_rpc_ok`, {
      p_tgid: normalizedTgid,
      has_data: data != null,
    });
    return { ok: true, data };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] token_match_rpc_error`, {
      p_tgid: normalizedTgid,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "rpc_exception" };
  }
}

module.exports = {
  upsertPurchaseCreated,
  markPurchasePaidAndProcess,
  matchPurchaseByTgTokenShadow,
};
