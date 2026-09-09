// Local PostgREST-shaped stub for the Stripe webhook harness.
//
// It exists to exercise branching, idempotency and outage behavior without a
// Supabase project or a Stripe account. A green result proves the handler logic;
// it does NOT replace a real Stripe test-mode + Supabase integration pass.
import http from "node:http";

const state = {
  events: new Map(),
  patches: [],
  activity: [],
  invoices: new Map(),
  down: false,
};

state.invoices.set("in_final_1", {
  id: "row-final",
  project_id: "proj-1",
  kind: "final",
  amount: "1000.00",
});
state.invoices.set("in_dep_1", {
  id: "row-dep",
  project_id: "proj-1",
  kind: "deposit",
  amount: "1000.00",
});

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    const [path, query = ""] = req.url.replace("/rest/v1/", "").split("?");
    const send = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };

    if (path === "stripe_events") {
      if (state.down) return send(503, { code: "STUB_OUTAGE" });

      if (req.method === "POST") {
        const { event_id, type } = JSON.parse(body);
        if (state.events.has(event_id)) return send(409, { code: "23505" });
        state.events.set(event_id, { type, status: "received" });
        return send(201, []);
      }

      if (req.method === "PATCH") {
        const id = decodeURIComponent(query.split("event_id=eq.")[1] || "");
        const patch = JSON.parse(body);
        if (state.events.has(id)) Object.assign(state.events.get(id), patch);
        return send(204);
      }

      if (req.method === "DELETE") {
        const id = decodeURIComponent(query.split("event_id=eq.")[1] || "");
        state.events.delete(id);
        return send(204);
      }
    }

    if (path === "invoices" && req.method === "PATCH") {
      const sid = decodeURIComponent(
        (query.split("stripe_invoice_id=eq.")[1] || "").split("&")[0],
      );
      state.patches.push({ table: "invoices", sid, patch: JSON.parse(body) });
      const row = state.invoices.get(sid);
      return send(200, row ? [row] : []);
    }

    if (path === "care_plans" && req.method === "PATCH") {
      const sid = decodeURIComponent(
        (query.split("stripe_subscription_id=eq.")[1] || "").split("&")[0],
      );
      state.patches.push({ table: "care_plans", sid, patch: JSON.parse(body) });
      return send(200, sid === "sub_known" ? [{ id: "care-1" }] : []);
    }

    if (path === "projects" && req.method === "PATCH") {
      const id = decodeURIComponent((query.split("id=eq.")[1] || "").split("&")[0]);
      state.patches.push({ table: "projects", id, patch: JSON.parse(body) });
      return send(204);
    }

    if (path === "project_activity" && req.method === "POST") {
      state.activity.push(JSON.parse(body));
      return send(201, []);
    }

    if (path === "__state") {
      return send(200, {
        events: [...state.events.entries()].map(([id, value]) => ({ id, ...value })),
        patches: state.patches,
        activity: state.activity,
      });
    }

    if (path === "__down") {
      state.down = !query.includes("off");
      return send(200, { down: state.down });
    }

    if (path === "__reset") {
      state.patches = [];
      state.activity = [];
      state.events.clear();
      state.down = false;
      return send(200, { ok: true });
    }

    return send(404, { error: `stub: no route ${req.method} ${req.url}` });
  });
});

server.listen(4000, "127.0.0.1", () => {
  console.log("webhook PostgREST stub listening on http://127.0.0.1:4000");
});
