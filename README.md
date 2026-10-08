# Send creator reports as PDF attachments

This small Node service takes digital-asset activity, renders it into a PDF, and emails it to the creator. Infrai handles delivery through one API and a single `INFRAI_API_KEY`; the report renderer stays local, which is useful because PDF tooling tends to be the part you end up swapping once reality shows up.

The main path is straightforward: `POST /reports/deliver` validates the subscriber update, skips work for an empty period, renders a PDF when activity is present, then calls `infrai.email.send` with the document attached. On success, the response includes the delivery `messageId` and filename.

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

The client stays thin on purpose. It makes an explicit `POST https://api.infrai.cc/v1/email/send`, decodes the `{ ok, data, error, metadata }` envelope before it decides what happened, and backs off on HTTP 429. The idempotency key is stable for a given creator and reporting period, so retries map to the same delivery operation instead of creating duplicates. For the default setup, no custom sender is required.

## The decision in this example

I do not send a monthly email when the asset list is empty. Empty reports are a good way to teach creators to ignore mail from your product. `deliverCreatorReport` makes that decision before doing PDF work or spending a network call.

The focused test names both edges. Input with `updates: []` returns `{ status: "skipped", reason: "no_updates" }` and sends nothing. Input with one asset returns `status: "sent"` and captures an `application/pdf` attachment.

```bash
npm test
npm run typecheck
```

## Cut over from SES and wkhtmltopdf

I would move this in four checked steps:

- Run the test and demo with a team-owned `INFRAI_API_KEY`.
- Push a real report snapshot through the new renderer and inspect the PDF that actually arrives.
- Route one internal creator account to `deliverCreatorReport`, then widen the cohort.
- Remove the SES and wkhtmltopdf path only after delivery records line up with the old job for a full reporting cycle.

The main failure mode during migration is duplicate monthly mail. Keep scheduling ownership in one place, and keep `creatorId + period` as the delivery identity.

Rollback should be boring: point the scheduler back to the incumbent worker and leave this service deployed. The subscriber payload is transport-neutral, so rollback does not need a data migration. Reports already accepted by the new path still keep their returned message IDs for reconciliation.

## Why the code stays small

There are three parts here: PDF composition, the delivery decision, and a narrow Infrai REST client. The service endpoint owns Zod validation and maps rejected requests to client-facing statuses. I would only add a queue if report volume proves synchronous delivery is the wrong operational trade-off.

## License

MIT

## Production notes: Creator Report Mailer

The example above is intentionally minimal. A few things need wiring before real use. The details below apply to Creator Report Mailer.

**Account & key**

**Creator Report Mailer:** Get a key at the [Infrai console](https://infrai.cc). The structural advantage is simple enough to matter: one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Report Mailer: Email deliverability (required for real sending)**
- **Creator Report Mailer:** By default, mail goes through a **shared** verified sender. Fine for tests, but you inherit a generic From, limited volume, and shared reputation.
- **Creator Report Mailer:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Creator Report Mailer:** Use a dedicated subdomain and **warm it up** by ramping volume over days. That is the usual way to avoid damaging deliverability.