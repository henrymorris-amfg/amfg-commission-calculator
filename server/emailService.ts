/**
 * emailService.ts
 * Sends tier change notification emails to AEs via Resend.
 * Falls back gracefully if RESEND_API_KEY is not configured.
 */

import { ENV } from "./_core/env";

export interface TierChangeEmailPayload {
  toEmail: string;
  toName: string;
  previousTier: string;
  newTier: string;
  month: number;
  year: number;
  avgArrUsd: number;
  avgDemosPw: number;
  avgDialsPw: number;
  nextTierTargets?: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  } | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
};

const TIER_RATES: Record<string, string> = {
  bronze: "13%",
  silver: "16%",
  gold: "19%",
};

function buildEmailHtml(payload: TierChangeEmailPayload): string {
  const {
    toName, previousTier, newTier, month, year,
    avgArrUsd, avgDemosPw, avgDialsPw, nextTierTargets,
  } = payload;

  const isPromotion = newTier > previousTier;
  const monthName = MONTH_NAMES[month - 1];
  const newTierColor = TIER_COLORS[newTier] ?? "#888";
  const newRate = TIER_RATES[newTier] ?? "—";
  const prevRate = TIER_RATES[previousTier] ?? "—";

  const subject = isPromotion
    ? `🎉 You've reached ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} tier — ${monthName} ${year}`
    : `📉 Tier update: ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} for ${monthName} ${year}`;

  const headline = isPromotion
    ? `Congratulations, ${toName.split(" ")[0]}! You've been promoted to <strong style="color:${newTierColor}">${newTier.toUpperCase()}</strong> tier.`
    : `Hi ${toName.split(" ")[0]}, your tier for ${monthName} ${year} has been updated to <strong style="color:${newTierColor}">${newTier.toUpperCase()}</strong>.`;

  const rateChange = isPromotion
    ? `Your commission rate increases from <strong>${prevRate}</strong> to <strong>${newRate}</strong> — effective for all new deals this month.`
    : `Your commission rate moves from <strong>${prevRate}</strong> to <strong>${newRate}</strong> for new deals this month.`;

  const nextTierSection = nextTierTargets && newTier !== "gold"
    ? `
      <div style="margin-top:24px;padding:16px;background:#f9f9f9;border-left:4px solid ${newTierColor};border-radius:4px;">
        <p style="margin:0 0 8px;font-weight:600;color:#333;">To reach the next tier:</p>
        <ul style="margin:0;padding-left:20px;color:#555;font-size:14px;">
          <li>Monthly ARR: <strong>$${nextTierTargets.arrUsd.toLocaleString()}</strong>/mo avg</li>
          <li>Demos: <strong>${nextTierTargets.demosPw}/wk</strong> avg</li>
          <li>Dials: <strong>${nextTierTargets.dialsPw}/wk</strong> avg</li>
        </ul>
      </div>
    `
    : newTier === "gold"
    ? `<div style="margin-top:24px;padding:16px;background:#fffbea;border-left:4px solid #ffd700;border-radius:4px;"><p style="margin:0;color:#555;">You're at the top tier — keep it up! 🏆</p></div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:${newTierColor};padding:32px 40px;">
      <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;text-transform:uppercase;letter-spacing:1px;">AMFG Commission</p>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:700;">Tier Update — ${monthName} ${year}</h1>
    </div>
    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="margin:0 0 16px;font-size:16px;color:#333;line-height:1.6;">${headline}</p>
      <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">${rateChange}</p>

      <!-- Current metrics -->
      <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Your 3-Month Rolling Averages</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#555;">Monthly ARR</td>
            <td style="padding:6px 0;font-size:14px;font-weight:600;color:#333;text-align:right;">$${avgArrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#555;">Demos / week</td>
            <td style="padding:6px 0;font-size:14px;font-weight:600;color:#333;text-align:right;">${avgDemosPw.toFixed(1)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#555;">Dials / week</td>
            <td style="padding:6px 0;font-size:14px;font-weight:600;color:#333;text-align:right;">${Math.round(avgDialsPw)}</td>
          </tr>
        </table>
      </div>

      ${nextTierSection}

      <p style="margin:24px 0 0;font-size:13px;color:#999;">
        This is an automated notification from the AMFG Commission Calculator.
        Log in to view your full commission breakdown.
      </p>
    </div>
    <!-- Footer -->
    <div style="padding:16px 40px;background:#f9f9f9;border-top:1px solid #eee;">
      <p style="margin:0;font-size:12px;color:#aaa;">AMFG · Commission Calculator · ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send a tier change email to an AE via Resend.
 * Returns true on success, false if Resend is not configured or the send fails.
 */
export async function sendTierChangeEmail(payload: TierChangeEmailPayload): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[emailService] RESEND_API_KEY not configured — skipping email to", payload.toEmail);
    return false;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(ENV.resendApiKey);

  const isPromotion = payload.newTier > payload.previousTier;
  const monthName = MONTH_NAMES[payload.month - 1];
  const subject = isPromotion
    ? `🎉 You've reached ${payload.newTier.charAt(0).toUpperCase() + payload.newTier.slice(1)} tier — ${monthName} ${payload.year}`
    : `📉 Tier update: ${payload.newTier.charAt(0).toUpperCase() + payload.newTier.slice(1)} for ${monthName} ${payload.year}`;

  try {
    const { error } = await resend.emails.send({
      from: "AMFG Commission <commission@amfgcalc.manus.space>",
      to: [payload.toEmail],
      subject,
      html: buildEmailHtml(payload),
    });

    if (error) {
      console.error("[emailService] Resend error:", error);
      return false;
    }

    console.log(`[emailService] Tier change email sent to ${payload.toEmail} (${payload.previousTier} → ${payload.newTier})`);
    return true;
  } catch (err) {
    console.error("[emailService] Failed to send email:", err);
    return false;
  }
}
