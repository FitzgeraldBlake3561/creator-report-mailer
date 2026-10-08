import assert from "node:assert/strict";
import test from "node:test";
import { deliverCreatorReport } from "../src/creator_report.js";
import type { InfraiEmail, SendEmail } from "../src/infrai_email.js";

test("skips an empty subscriber update instead of sending noise", async () => {
  let sends = 0;
  const infrai = { email: { send: async () => { sends += 1; return { messageId: "unused", metadata: undefined }; } } } as InfraiEmail;
  const result = await deliverCreatorReport({
    creatorId: "creator_42", email: "maker@example.com", period: "2026-09", updates: [],
  }, infrai);
  assert.deepEqual(result, { status: "skipped", reason: "no_updates" });
  assert.equal(sends, 0);
});

test("attaches a PDF when a creator has asset activity", async () => {
  let captured: SendEmail | undefined;
  let key = "";
  const infrai = { email: { send: async (payload: SendEmail, idempotencyKey: string) => {
    captured = payload;
    key = idempotencyKey;
    return { messageId: "msg_123", metadata: undefined };
  } } } as InfraiEmail;
  const result = await deliverCreatorReport({
    creatorId: "creator_42",
    email: "maker@example.com",
    period: "2026-09",
    updates: [{ assetTitle: "Launch Kit", downloads: 12, netRevenueCents: 4900 }],
  }, infrai);
  assert.deepEqual(result, { status: "sent", messageId: "msg_123", filename: "creator-report-2026-09.pdf" });
  assert.equal(key, "creator-report:creator_42:2026-09");
  assert.equal(captured?.attachments[0]?.content_type, "application/pdf");
  assert.ok(captured?.attachments[0]?.content_base64.length);
});
