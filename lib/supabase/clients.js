const {
  SUPABASE_LOG_TAG,
  isSupabasePurchasesWriteEnabled,
  getSupabasePurchasesEnvDiag,
  getSupabaseServerClient,
} = require("./server");

function normalizeTgId(value) {
  return String(value == null ? "" : value).trim();
}

function toPostgrestError(error) {
  return {
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  };
}

function getSupabaseClientsService() {
  const envDiag = getSupabasePurchasesEnvDiag();
  if (!isSupabasePurchasesWriteEnabled()) {
    return { ok: false, reason: "feature_disabled", env: envDiag };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: "client_unavailable", env: envDiag };
  }

  return { ok: true, supabase };
}

async function getClientInfoByTgId(tgId) {
  const normalizedTgId = normalizeTgId(tgId);
  if (!normalizedTgId) return { ok: false, reason: "missing_tgid", data: null };

  const service = getSupabaseClientsService();
  if (!service.ok) {
    console.warn(`[${SUPABASE_LOG_TAG}] clients_lookup_skipped`, {
      tgid: normalizedTgId,
      reason: service.reason,
      env: service.env,
    });
    return { ok: false, reason: service.reason, data: null };
  }

  try {
    const { data, error } = await service.supabase
      .from("clients")
      .select(
        "id,fio,email,tgid,currency,tag,balance,old_prices,final_day,future_plan,freeze_option"
      )
      .eq("tgid", normalizedTgId)
      .maybeSingle();

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] clients_lookup_error`, {
        tgid: normalizedTgId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "lookup_error", data: null };
    }

    return { ok: true, data: data || null };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] clients_lookup_error`, {
      tgid: normalizedTgId,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "lookup_exception", data: null };
  }
}

async function updateClientFuturePlan(tgId, isoDate) {
  const normalizedTgId = normalizeTgId(tgId);
  if (!normalizedTgId) return { ok: false, reason: "missing_tgid" };
  if (!isoDate) return { ok: false, reason: "bad_date" };

  const service = getSupabaseClientsService();
  if (!service.ok) {
    console.warn(`[${SUPABASE_LOG_TAG}] clients_future_plan_skipped`, {
      tgid: normalizedTgId,
      reason: service.reason,
      env: service.env,
    });
    return { ok: false, reason: service.reason };
  }

  try {
    const { data, error } = await service.supabase
      .from("clients")
      .update({ future_plan: isoDate })
      .eq("tgid", normalizedTgId)
      .select("id,fio,tag,future_plan")
      .maybeSingle();

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] clients_future_plan_error`, {
        tgid: normalizedTgId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "update_error" };
    }
    if (!data) return { ok: false, reason: "not_found" };

    return { ok: true, data };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] clients_future_plan_error`, {
      tgid: normalizedTgId,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "update_exception" };
  }
}

async function getClientFreezeState(tgId) {
  const result = await getClientInfoByTgId(tgId);
  if (!result.ok || !result.data) return result;

  return {
    ok: true,
    data: {
      id: result.data.id,
      final_day: result.data.final_day || null,
      freeze_option: result.data.freeze_option === true,
    },
  };
}

function addDaysToIsoDate(isoDate, daysToAdd) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = Number(daysToAdd);
  if (!Number.isFinite(days)) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

async function applyClientFreeze(tgId, daysToAdd) {
  const normalizedTgId = normalizeTgId(tgId);
  if (!normalizedTgId) return { ok: false, reason: "missing_tgid" };

  const state = await getClientFreezeState(normalizedTgId);
  if (!state.ok) return { ok: false, reason: state.reason || "lookup_error" };
  if (!state.data) return { ok: false, reason: "not_found" };
  if (state.data.freeze_option === true) {
    return { ok: false, reason: "already_used" };
  }
  if (!state.data.final_day) return { ok: false, reason: "no_final_day" };

  const newFinalDay = addDaysToIsoDate(state.data.final_day, daysToAdd);
  if (!newFinalDay) return { ok: false, reason: "bad_date" };

  const service = getSupabaseClientsService();
  if (!service.ok) return { ok: false, reason: service.reason };

  try {
    const { error } = await service.supabase
      .from("clients")
      .update({ final_day: newFinalDay, freeze_option: true })
      .eq("tgid", normalizedTgId);

    if (error) {
      console.error(`[${SUPABASE_LOG_TAG}] clients_freeze_error`, {
        tgid: normalizedTgId,
        error: toPostgrestError(error),
      });
      return { ok: false, reason: "update_error" };
    }

    return { ok: true, newFinalDay };
  } catch (error) {
    console.error(`[${SUPABASE_LOG_TAG}] clients_freeze_error`, {
      tgid: normalizedTgId,
      error: toPostgrestError(error),
    });
    return { ok: false, reason: "update_exception" };
  }
}

module.exports = {
  getClientInfoByTgId,
  updateClientFuturePlan,
  getClientFreezeState,
  applyClientFreeze,
};
