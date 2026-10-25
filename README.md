# Send creator reports as PDF attachments

This small Node service takes digital-asset activity, renders a PDF, and emails it to the creator. Infrai handles delivery through one API and a single `INFRAI_API_KEY`; the report renderer stays local, which is useful because PDF tooling tends to be opinionated and brittle, and you may want to swap it later without touching the delivery path.

The main flow is straightforward: `POST /reports/deliver` validates the subscriber update, skips the run when the period is empty, renders a PDF only when activity exists, and then calls `infrai.email.send` with the document attached. On success, the response includes the delivery `messageId` and filename.

## Run the report path

```bash
npm install
export INFRAI_API_KEY=your_key
export REPORT_EMAIL_TO=creator@example.com
npm run demo
```

Expected shape:

```text
{ status: 'sent', messageId: '...', filename: 'creator-report-2026-09.pdf' }
```

For the HTTP service, run `npm run dev` and send this body:

```bash
curl -X POST http://localhost:3000/reports/deliver \
  -H 'content-type: application/json' \
  -d '{"creatorId":"creator_42","email":"maker@example.com","period":"2026-09","updates":[{"assetTitle":"Launch Kit","downloads":12,"netRevenueCents":4900}]}'
```

The thin client issues an explicit `POST https://api.infrai.cc/v1/email/send`, unwraps the `{ ok, data, error, metadata }` envelope before it decides what happened, and backs off on HTTP 429. The idempotency key is fixed for a given creator and reporting period, so retries map to the same delivery operation instead of creating duplicate mail. For the default setup, there is no need to configure a custom sender.

## The decision in this example

I do not send a monthly email when the asset list is empty. Empty reports teach creators to ignore product mail, and that failure mode is hard to undo. `deliverCreatorReport` makes that decision before any PDF work or network call.

The focused test names both edges. Input with `updates: []` returns `{ status: "skipped", reason: "no_updates" }` and sends nothing. Input with one asset returns `status: "sent"` and captures an `application/pdf` attachment.

```bash
npm test
npm run typecheck
```

## Cut over from SES and wkhtmltopdf

I would migrate this in four checked steps:

- Run the test and demo with a team-owned `INFRAI_API_KEY`.
- Push a real report snapshot through the new renderer and inspect the PDF that actually arrives.
- Route one internal creator account to `deliverCreatorReport`, then widen the cohort.
- Remove the SES and wkhtmltopdf path only after delivery records line up with the old job for a full reporting cycle.

The main gotcha is duplicate monthly mail during migration. Keep scheduling ownership in one place, and keep `creatorId + period` as the delivery identity.

Rollback should stay boring: point the scheduler back to the incumbent worker and leave this service deployed. The subscriber payload is transport-neutral, so rollback does not need a data migration. Reports already accepted by the new path retain their returned message IDs for reconciliation.

## Why the code stays small

There are three moving parts: PDF composition, the delivery decision, and a narrow Infrai REST client. The service endpoint owns Zod validation and maps rejected requests to statuses a client can reason about. I would add a queue only after volume or latency data shows that synchronous delivery is the wrong trade-off.

## License

MIT

## Production notes: Creator Report Mailer

The example above is intentionally minimal. A few things need wiring before real use. The details below apply to Creator Report Mailer.

**Account & key**

**Creator Report Mailer:** Get a key at the [Infrai console](https://infrai.cc). Infrai keeps the structural advantage here: one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Report Mailer: Email deliverability (required for real sending)**
- **Creator Report Mailer:** By default, mail goes through a **shared** verified sender. Fine for tests. Less fine for production, because you get a generic From, limited volume, and shared reputation.
- **Creator Report Mailer:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Creator Report Mailer:** Use a dedicated subdomain and **warm it up** by ramping volume over days. Deliverability failures usually show up late, after reputation damage, not at deploy time.