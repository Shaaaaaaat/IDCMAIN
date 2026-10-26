const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  handlePurchaseTokenFlow,
  resolvePurchaseMessageStudioId,
} = require("../lib/purchase-token-flow");

class FakeInlineKeyboard {
  constructor() {
    this.buttons = [];
  }

  add(button) {
    this.buttons.push(button);
    return this;
  }

  row() {
    this.buttons.push({ row: true });
    return this;
  }
}

function createCtx(overrides = {}) {
  const replies = [];
  const order = overrides.order || [];
  return {
    from: {
      id: overrides.id || 111,
      username: overrides.username || "buyer",
    },
    replies,
    reply: async (text, options) => {
      order.push("reply");
      replies.push({ text, options });
    },
  };
}

function createDeps({
  lookupResult,
  matchResult = { ok: true, data: { ok: true } },
  purchaseOverride = {},
} = {}) {
  const calls = {
    lookup: 0,
    lookupArgs: [],
    match: 0,
    matchArgs: [],
    admin: 0,
    adminArgs: [],
    order: [],
  };
  const purchase = {
    id: "purchase-1",
    status: "Paid",
    tgid: null,
    fi: "Анна",
    email: "anna@example.com",
    sum: 1400,
    currency: "RUB",
    format: "",
    studio_slug: "",
    slot_start_at: "",
    tag: "",
    course_name: "",
    ...purchaseOverride,
  };

  return {
    calls,
    deps: {
      lookupPurchaseByToken: async (token) => {
        calls.lookup += 1;
        calls.lookupArgs.push([token]);
        calls.order.push("lookup");
        return lookupResult || { ok: true, data: purchase };
      },
      matchPurchaseByTgToken: async (args) => {
        calls.match += 1;
        calls.matchArgs.push(args);
        calls.order.push("match");
        return matchResult;
      },
      sendAdminFollowUp: async (args) => {
        calls.admin += 1;
        calls.adminArgs.push(args);
        calls.order.push("admin");
      },
      InlineKeyboard: FakeInlineKeyboard,
      gymStudioMeta: {
        spb_hellskitchen: {
          name: "Hells Kitchen",
          address: "адрес HKC",
          trainer: "Дима",
          mapUrl: "https://example.com/map",
        },
      },
      formatSlotStartDate: (value) => String(value || "").slice(0, 5),
      formatMoney: (sum, currency) => `${sum} ${currency}`,
      resolveOfflineStudioIdForPurchase: (_studio, tag) => (
        String(tag || "").includes("HKC") ? "spb_hkc" : null
      ),
      logError: () => {},
    },
  };
}

test("paid purchase with empty tgid calls RPC and sends success in order", async () => {
  const { calls, deps } = createDeps();
  const ctx = createCtx({ order: calls.order });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.lookup, 1);
  assert.equal(calls.match, 1);
  assert.equal(calls.admin, 1);
  assert.deepEqual(calls.lookupArgs, [["token-1"]]);
  assert.deepEqual(calls.matchArgs, [{
    token: "token-1",
    tgid: "111",
    username: "buyer",
  }]);
  assert.equal(calls.adminArgs[0].tgId, 111);
  assert.equal(calls.adminArgs[0].username, "buyer");
  assert.deepEqual(calls.order, ["lookup", "match", "admin", "reply"]);
  assert.match(ctx.replies.at(-1).text, /Оплата подтверждена/);
});

test("missing purchase keeps not found message and does not call RPC", async () => {
  const ctx = createCtx();
  const { calls, deps } = createDeps({
    lookupResult: { ok: true, reason: "not_found", data: null },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "not_found");
  assert.equal(calls.match, 0);
  assert.match(ctx.replies[0].text, /Не нашёл оплату/);
});

test("unpaid purchase keeps unpaid message and does not call RPC", async () => {
  const ctx = createCtx();
  const { calls, deps } = createDeps({
    purchaseOverride: { status: "Created" },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "not_paid");
  assert.equal(calls.match, 0);
  assert.match(ctx.replies[0].text, /ещё не подтверждена/);
});

test("foreign tgid keeps refusal and does not call RPC", async () => {
  const ctx = createCtx({ id: 111 });
  const { calls, deps } = createDeps({
    purchaseOverride: { tgid: "222" },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "foreign_tgid");
  assert.equal(calls.match, 0);
  assert.match(ctx.replies[0].text, /привязана к другому аккаунту/);
});

test("matching tgid is allowed and calls RPC", async () => {
  const ctx = createCtx({ id: 111 });
  const { calls, deps } = createDeps({
    purchaseOverride: { tgid: "111" },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.match, 1);
});

test("lookup error or disabled is technical error, not not-found", async () => {
  const ctx = createCtx();
  const { calls, deps } = createDeps({
    lookupResult: { ok: false, reason: "feature_disabled" },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "feature_disabled");
  assert.equal(calls.match, 0);
  assert.match(ctx.replies[0].text, /технической ошибки/);
  assert.doesNotMatch(ctx.replies[0].text, /Не нашёл оплату/);
});

test("RPC technical error does not send success", async () => {
  const ctx = createCtx();
  const { deps } = createDeps({
    matchResult: { ok: false, reason: "rpc_error" },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "rpc_error");
  assert.match(ctx.replies[0].text, /технической ошибки/);
  assert.equal(ctx.replies.some((reply) => /Оплата подтверждена/.test(reply.text)), false);
});

test("RPC data ok false does not send success", async () => {
  const ctx = createCtx();
  const { deps } = createDeps({
    matchResult: { ok: true, data: { ok: false } },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "match_failed");
  assert.match(ctx.replies[0].text, /технической ошибки/);
  assert.equal(ctx.replies.some((reply) => /Оплата подтверждена/.test(reply.text)), false);
});

test("unknown RPC result does not send success", async () => {
  const ctx = createCtx();
  const { deps } = createDeps({
    matchResult: { ok: true, data: {} },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.reason, "match_failed");
  assert.match(ctx.replies[0].text, /технической ошибки/);
});

test("gym mapping uses Supabase fields and applies spb_hkc alias after fallback", async () => {
  const ctx = createCtx();
  const { deps } = createDeps({
    purchaseOverride: {
      fi: "Мария",
      format: "gym",
      studio_slug: "",
      slot_start_at: "12.11.2026",
      tag: "SPB_group_HKC_start",
    },
  });

  const result = await handlePurchaseTokenFlow({
    ctx,
    token: "token-1",
    ...deps,
  });

  assert.equal(result.ok, true);
  assert.equal(resolvePurchaseMessageStudioId(
    { studio_slug: "", tag: "SPB_group_HKC_start" },
    deps.resolveOfflineStudioIdForPurchase,
    deps.gymStudioMeta
  ), "spb_hellskitchen");
  assert.match(ctx.replies.map((reply) => reply.text).join("\n"), /Hells Kitchen/);
  assert.match(ctx.replies.map((reply) => reply.text).join("\n"), /12\.11/);
});

test("human-readable studio_slug falls back through existing resolver", async () => {
  const { deps } = createDeps();

  const studioId = resolvePurchaseMessageStudioId(
    { studio_slug: "м. Выборгская", tag: "" },
    (studioRaw) => (
      String(studioRaw || "").toLowerCase().includes("выборг")
        ? "spb_hkc"
        : null
    ),
    deps.gymStudioMeta
  );

  assert.equal(studioId, "spb_hellskitchen");
});

test("handler module and token branch have no Airtable dependency", () => {
  const handlerSource = fs.readFileSync(
    path.join(__dirname, "../lib/purchase-token-flow.js"),
    "utf8"
  );
  assert.doesNotMatch(handlerSource, /Airtable|getPurchaseByToken|patchAirtableRecord/);

  const indexSource = fs.readFileSync(
    path.join(__dirname, "../index.js"),
    "utf8"
  );
  const branchStart = indexSource.indexOf("await handlePurchaseTokenFlow({");
  assert.notEqual(branchStart, -1);
  const branchEnd = indexSource.indexOf("// дальше можно сразу показать меню", branchStart);
  assert.notEqual(branchEnd, -1);
  const tokenBranch = indexSource.slice(branchStart, branchEnd);

  assert.match(tokenBranch, /lookupPurchaseByToken:\s*getPurchaseByTgLinkToken/);
  assert.doesNotMatch(tokenBranch, /Airtable|getPurchaseByToken|patchAirtableRecord/);
});
