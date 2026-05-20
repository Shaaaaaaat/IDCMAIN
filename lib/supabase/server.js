const SUPABASE_LOG_TAG = "IDC_TG_BOT_SUPABASE";

let cachedClient = null;
let initAttempted = false;

function isSupabaseEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getSupabasePurchasesEnvDiag() {
  const rawUrl = String(process.env.SUPABASE_URL || "").trim();
  let urlHost = "";
  try {
    urlHost = rawUrl ? new URL(rawUrl).host : "";
  } catch (_) {
    urlHost = "";
  }
  return {
    hasUrl: Boolean(rawUrl),
    urlHost,
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    enabledMaster: isSupabaseEnabled(process.env.SUPABASE_ENABLED),
    writePurchasesFlag: isSupabaseEnabled(process.env.SUPABASE_WRITE_PURCHASES),
  };
}

function isSupabasePurchasesWriteEnabled() {
  return (
    isSupabaseEnabled(process.env.SUPABASE_ENABLED) &&
    isSupabaseEnabled(process.env.SUPABASE_WRITE_PURCHASES)
  );
}

function getSupabaseServerClient() {
  if (cachedClient) return cachedClient;
  if (initAttempted) return null;
  initAttempted = true;

  const url = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) {
    return null;
  }

  try {
    const { createClient } = require("@supabase/supabase-js");
    cachedClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return cachedClient;
  } catch (error) {
    console.error(
      `[${SUPABASE_LOG_TAG}] supabase_client_init_error`,
      error?.message || error
    );
    return null;
  }
}

module.exports = {
  SUPABASE_LOG_TAG,
  isSupabaseEnabled,
  isSupabasePurchasesWriteEnabled,
  getSupabasePurchasesEnvDiag,
  getSupabaseServerClient,
};
