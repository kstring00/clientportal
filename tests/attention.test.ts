import assert from "node:assert/strict";
import test from "node:test";

import { buildAttention, resolveNextAction } from "../lib/portal/attention.ts";
import type {
  PortalApproval,
  PortalFileRequest,
  PortalInvoice,
  PortalMessage,
} from "../lib/portal/types.ts";

const approval = (overrides: Partial<PortalApproval> = {}): PortalApproval => ({
  id: "a1",
  title: "Review homepage",
  detail: null,
  previewUrl: null,
  fileId: null,
  status: "waiting",
  requestedAt: "2026-09-08T00:00:00Z",
  decidedAt: null,
  decidedByName: null,
  history: [],
  ...overrides,
});

const fileRequest = (overrides: Partial<PortalFileRequest> = {}): PortalFileRequest => ({
  id: "f1",
  label: "Logo SVG",
  detail: null,
  category: "brand",
  status: "waiting",
  receivedAt: null,
  ...overrides,
});

const invoice = (overrides: Partial<PortalInvoice> = {}): PortalInvoice => ({
  id: "i1",
  kind: "deposit",
  amount: 1000,
  currency: "usd",
  status: "draft",
  hostedUrl: null,
  issuedAt: null,
  dueAt: null,
  paidAt: null,
  ...overrides,
});

const message = (overrides: Partial<PortalMessage> = {}): PortalMessage => ({
  id: "m1",
  kind: "message",
  body: "Quick question",
  senderName: "Studio",
  senderRole: "admin",
  isMine: false,
  fileId: null,
  createdAt: "2026-09-08T00:00:00Z",
  read: false,
  ...overrides,
});

test("draft invoices are excluded from attention", () => {
  const items = buildAttention({
    approvals: [],
    fileRequests: [],
    invoices: [invoice()],
    messages: [],
  });
  assert.deepEqual(items, []);
});

test("the client's own unread message is not treated as work", () => {
  const items = buildAttention({
    approvals: [],
    fileRequests: [],
    invoices: [],
    messages: [message({ isMine: true })],
  });
  assert.deepEqual(items, []);
});

test("now items sort before soon items", () => {
  const items = buildAttention({
    approvals: [approval()],
    fileRequests: [fileRequest()],
    invoices: [],
    messages: [],
  });
  assert.equal(items[0]?.section, "approvals");
  assert.equal(items[0]?.urgency, "now");
  assert.equal(items[1]?.section, "files");
  assert.equal(items[1]?.urgency, "soon");
});

test("unread studio messages collapse into one attention item", () => {
  const items = buildAttention({
    approvals: [],
    fileRequests: [],
    invoices: [],
    messages: [message({ id: "m1" }), message({ id: "m2" })],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.label, "2 unread messages");
});

test("explicit next-action sentence always wins", () => {
  const attention = buildAttention({
    approvals: [approval()],
    fileRequests: [],
    invoices: [],
    messages: [],
  });
  assert.deepEqual(resolveNextAction("Send final staff photos", attention), {
    text: "Send final staff photos",
    href: null,
    derived: false,
  });
});

test("no explicit action and no attention produces a calm empty state", () => {
  assert.deepEqual(resolveNextAction(null, []), {
    text: "No action needed from you.",
    href: null,
    derived: true,
  });
});
