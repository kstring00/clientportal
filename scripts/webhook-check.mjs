import { createHmac } from "node:crypto";

const SECRET = "whsec_testsecret";
let failures = 0;

function ok(label, condition, extra = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${extra ? `  ${extra}` : ""}`);
}

const sign = (payload, timestamp = Math.floor(Date.now() / 1000)) =>
  `t=${timestamp},v1=${createHmac("sha256", SECRET)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex")}`;

async function post(payload, signature) {
  const response = await fetch("http://127.0.0.1:3000/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body: payload,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
}

async function stub(path) {
  const response = await fetch(`http://127.0.0.1:4000/rest/v1/${path}`);
  if (!response.ok) {
    throw new Error(`Stub ${path} returned ${response.status}. Is npm run webhook:stub running?`);
  }
  return response.json();
}

const event = (id, type, object) =>
  JSON.stringify({ id, type, data: { object } });

try {
  await stub("__reset");

  let payload = event("evt_1", "invoice.paid", { id: "in_final_1" });
  ok("missing signature rejected", (await post(payload)).status === 400);
  ok(
    "bad signature rejected",
    (await post(payload, "t=1,v1=deadbeef")).status === 400,
  );
  ok(
    "tampered payload rejected",
    (await post(event("evt_x", "invoice.paid", { id: "in_final_1" }), sign(payload)))
      .status === 400,
  );
  const old = Math.floor(Date.now() / 1000) - 600;
  ok("stale timestamp rejected", (await post(payload, sign(payload, old))).status === 400);

  let response = await post(payload, sign(payload));
  ok(
    "valid signature accepted",
    response.status === 200 && response.body.handled === true,
    JSON.stringify(response.body),
  );

  let state = await stub("__state");
  let invoicePatch = state.patches.find((entry) => entry.table === "invoices");
  let projectPatch = state.patches.find((entry) => entry.table === "projects");
  ok(
    "invoice marked paid",
    invoicePatch?.patch.status === "paid" && Boolean(invoicePatch?.patch.paid_at),
  );
  ok(
    "final payment opens handoff gate",
    Boolean(projectPatch?.patch.final_payment_cleared_at),
    JSON.stringify(projectPatch?.patch),
  );
  ok("event recorded handled", state.events[0]?.status === "handled", state.events[0]?.detail);

  const before = (await stub("__state")).patches.length;
  response = await post(payload, sign(payload));
  const after = (await stub("__state")).patches.length;
  ok(
    "duplicate returns 200",
    response.status === 200 && response.body.duplicate === true,
    JSON.stringify(response.body),
  );
  ok("duplicate applies no state change", before === after, `${before} -> ${after}`);

  await stub("__reset");
  payload = event("evt_2", "invoice.paid", { id: "in_dep_1" });
  await post(payload, sign(payload));
  state = await stub("__state");
  projectPatch = state.patches.find((entry) => entry.table === "projects");
  ok("deposit starts the project", Boolean(projectPatch?.patch.started_at));
  ok("deposit does not open handoff gate", !projectPatch?.patch.final_payment_cleared_at);

  await stub("__reset");
  payload = event("evt_3", "invoice.payment_failed", { id: "in_final_1" });
  await post(payload, sign(payload));
  state = await stub("__state");
  ok(
    "failed payment marks invoice past due",
    state.patches.find((entry) => entry.table === "invoices")?.patch.status === "past_due",
  );
  ok(
    "failed payment does not open gate",
    !state.patches.find((entry) => entry.table === "projects"),
  );

  await stub("__reset");
  payload = event("evt_4", "customer.subscription.deleted", {
    id: "sub_known",
    status: "canceled",
    cancel_at_period_end: false,
  });
  response = await post(payload, sign(payload));
  state = await stub("__state");
  let carePatch = state.patches.find((entry) => entry.table === "care_plans");
  ok(
    "subscription cancel accepted",
    response.status === 200 && response.body.handled === true,
    JSON.stringify(response.body),
  );
  ok(
    "care plan set cancelled",
    carePatch?.patch.status === "cancelled" && Boolean(carePatch?.patch.cancelled_at),
    JSON.stringify(carePatch?.patch),
  );

  await stub("__reset");
  payload = event("evt_4b", "customer.subscription.updated", {
    id: "sub_known",
    status: "active",
    cancel_at_period_end: true,
  });
  await post(payload, sign(payload));
  state = await stub("__state");
  carePatch = state.patches.find((entry) => entry.table === "care_plans");
  ok("cancel-at-period-end maps to cancelling", carePatch?.patch.status === "cancelling");

  await stub("__reset");
  payload = event("evt_4c", "customer.subscription.updated", {
    id: "sub_unknown",
    status: "active",
    metadata: { project_id: "proj-missing" },
  });
  response = await post(payload, sign(payload));
  state = await stub("__state");
  ok("unknown subscription does not fail delivery", response.status === 200);
  ok(
    "unknown subscription is recorded with detail",
    state.events[0]?.status === "handled" && /No care plan row/.test(state.events[0]?.detail ?? ""),
    state.events[0]?.detail,
  );

  await stub("__reset");
  payload = event("evt_5", "payment_intent.created", { id: "pi_1" });
  response = await post(payload, sign(payload));
  state = await stub("__state");
  ok("unhandled type returns handled:false", response.body.handled === false);
  ok("unhandled type recorded ignored", state.events[0]?.status === "ignored");
  ok("unhandled type applies no state change", state.patches.length === 0);

  await stub("__reset");
  await stub("__down");
  payload = event("evt_6", "invoice.paid", { id: "in_final_1" });
  response = await post(payload, sign(payload));
  ok(
    "datastore outage returns 500, not 200",
    response.status === 500,
    JSON.stringify(response.body),
  );
  ok(
    "datastore outage is not labelled duplicate",
    response.body.duplicate === undefined,
    JSON.stringify(response.body),
  );

  payload = event("evt_7", "payment_intent.created", { id: "pi_2" });
  response = await post(payload, sign(payload));
  ok(
    "outage on ignored type also returns 500",
    response.status === 500,
    JSON.stringify(response.body),
  );

  await stub("__down?off");
  payload = event("evt_6", "invoice.paid", { id: "in_final_1" });
  response = await post(payload, sign(payload));
  state = await stub("__state");
  ok(
    "retry after recovery is applied",
    response.status === 200 && response.body.handled === true,
    JSON.stringify(response.body),
  );
  ok(
    "retry after recovery opens handoff gate",
    Boolean(
      state.patches.find((entry) => entry.table === "projects")?.patch
        .final_payment_cleared_at,
    ),
  );

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nall webhook checks passed");
  process.exitCode = failures ? 1 : 0;
} catch (error) {
  console.error("webhook harness could not run:", error instanceof Error ? error.message : error);
  console.error(
    "Start the app with SUPABASE_URL=http://127.0.0.1:4000, a dummy SUPABASE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET=whsec_testsecret; run npm run webhook:stub in another terminal.",
  );
  process.exitCode = 1;
}
