import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { InfraiEmail } from "./infrai_email.js";

export type CreatorUpdate = {
  assetTitle: string;
  downloads: number;
  netRevenueCents: number;
};

export type ReportRequest = {
  creatorId: string;
  email: string;
  period: string;
  updates: CreatorUpdate[];
};

export type DeliveryResult =
  | { status: "skipped"; reason: "no_updates" }
  | { status: "sent"; messageId: string; filename: string };

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function renderCreatorReport(request: ReportRequest): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText(`Creator commerce report: ${request.period}`, {
    x: 48, y: 730, size: 20, font: bold, color: rgb(0.08, 0.15, 0.2),
  });
  page.drawText(`Creator ${request.creatorId}`, { x: 48, y: 700, size: 10, font: regular });
  request.updates.forEach((update, index) => {
    page.drawText(update.assetTitle, { x: 48, y: 650 - index * 34, size: 12, font: bold });
    page.drawText(`${update.downloads} downloads | ${money(update.netRevenueCents)} net revenue`, {
      x: 48, y: 634 - index * 34, size: 10, font: regular,
    });
  });
  return document.save();
}

export async function deliverCreatorReport(
  request: ReportRequest,
  infrai: InfraiEmail,
): Promise<DeliveryResult> {
  if (request.updates.length === 0) return { status: "skipped", reason: "no_updates" };

  const filename = `creator-report-${request.period}.pdf`;
  const pdf = await renderCreatorReport(request);
  const result = await infrai.email.send(
    {
      to: request.email,
      subject: `Your creator report for ${request.period}`,
      html: `<p>Your ${request.period} asset report is attached.</p>`,
      attachments: [{
        filename,
        content_base64: Buffer.from(pdf).toString("base64"),
        content_type: "application/pdf",
      }],
    },
    `creator-report:${request.creatorId}:${request.period}`,
  );
  return { status: "sent", messageId: result.messageId, filename };
}
