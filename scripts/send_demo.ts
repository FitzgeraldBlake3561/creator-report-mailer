import { deliverCreatorReport } from "../src/creator_report.js";
import { createInfraiEmail } from "../src/infrai_email.js";

const apiKey = process.env.INFRAI_API_KEY;
const recipient = process.env.REPORT_EMAIL_TO;
if (!apiKey || !recipient) throw new Error("INFRAI_API_KEY and REPORT_EMAIL_TO are required");

const result = await deliverCreatorReport({
  creatorId: "creator_demo",
  email: recipient,
  period: "2026-09",
  updates: [
    { assetTitle: "Studio Lighting Presets", downloads: 184, netRevenueCents: 12740 },
    { assetTitle: "Product Photo Workbook", downloads: 63, netRevenueCents: 7560 },
  ],
}, createInfraiEmail(apiKey));

console.log(result);
