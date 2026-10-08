import { createServer } from "node:http";
import { z } from "zod";
import { deliverCreatorReport } from "./creator_report.js";
import type { ReportRequest } from "./creator_report.js";
import { createInfraiEmail, InfraiError } from "./infrai_email.js";

const bodySchema = z.object({
  creatorId: z.string().min(1),
  email: z.string().email(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  updates: z.array(z.object({
    assetTitle: z.string().min(1).max(120),
    downloads: z.number().int().nonnegative(),
    netRevenueCents: z.number().int().nonnegative(),
  })).max(15),
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export function startReportService(port = 3000) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const infrai = createInfraiEmail(apiKey);

  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/reports/deliver") {
      json(response, 404, { error: "not_found" });
      return;
    }
    try {
      const parsed = bodySchema.safeParse(await readJson(request));
      if (!parsed.success) {
        json(response, 400, { error: "invalid_request", issues: parsed.error.issues });
        return;
      }
      json(response, 200, await deliverCreatorReport(parsed.data as ReportRequest, infrai));
    } catch (error) {
      if (error instanceof SyntaxError) {
        json(response, 400, { error: "invalid_json" });
      } else if (error instanceof InfraiError) {
        json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
          error: "delivery_rejected", code: error.code,
        });
      } else {
        json(response, 500, { error: "internal_error" });
      }
    }
  }).listen(port, () => console.log(`report service listening on http://localhost:${port}`));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startReportService(Number(process.env.PORT ?? 3000));
}
