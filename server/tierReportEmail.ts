/**
 * Monthly Tier Report Email Service
 * Generates and sends tier comparison reports for all AEs
 */

import { MONTH_NAMES } from "../shared/commission";

export interface AETierData {
  id: number;
  name: string;
  currentTier: string;
  currentRate: number;
  previousTier: string;
  previousRate: number;
  totalCommissionGbp: number;
  dealCount: number;
}

export function getTierChangeIndicator(current: string, previous: string): string {
  const tierRank = { bronze: 1, silver: 2, gold: 3 };
  const currentRank = tierRank[current as keyof typeof tierRank] || 1;
  const previousRank = tierRank[previous as keyof typeof tierRank] || 1;

  if (currentRank > previousRank) return "↑ PROMOTED";
  if (currentRank < previousRank) return "↓ DEMOTED";
  return "→ MAINTAINED";
}

export function generateTierReportHTML(
  aeData: AETierData[],
  reportMonth: number,
  reportYear: number,
  previousMonth: number,
  previousYear: number
): string {
  const monthName = MONTH_NAMES[reportMonth - 1];
  const previousMonthName = MONTH_NAMES[previousMonth - 1];

  const tableRows = aeData
    .map((ae) => {
      const change = getTierChangeIndicator(ae.currentTier, ae.previousTier);
      const changeColor =
        change.includes("PROMOTED") ? "#10b981" : change.includes("DEMOTED") ? "#ef4444" : "#6b7280";

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; text-align: left; font-weight: 500;">${ae.name}</td>
          <td style="padding: 12px; text-align: center;">
            <span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-weight: 600; text-transform: capitalize;">
              ${ae.currentTier}
            </span>
          </td>
          <td style="padding: 12px; text-align: center; font-weight: 600;">${ae.currentRate * 100}%</td>
          <td style="padding: 12px; text-align: center;">
            <span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 12px; text-transform: capitalize;">
              ${ae.previousTier}
            </span>
          </td>
          <td style="padding: 12px; text-align: center; color: ${changeColor}; font-weight: 600; font-size: 13px;">
            ${change}
          </td>
          <td style="padding: 12px; text-align: right; font-weight: 500;">£${ae.totalCommissionGbp.toFixed(2)}</td>
          <td style="padding: 12px; text-align: center; color: #6b7280;">${ae.dealCount}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.6; }
          .container { max-width: 900px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 28px; }
          .header p { margin: 8px 0 0 0; opacity: 0.9; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
          th { background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-box { background: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
          .summary-box p { margin: 0; color: #0c4a6e; font-size: 14px; }
          .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          .promoted { color: #10b981; font-weight: 600; }
          .demoted { color: #ef4444; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Monthly Commission Tier Report</h1>
            <p>${monthName} ${reportYear} (Comparing to ${previousMonthName} ${previousYear})</p>
          </div>

          <div class="section">
            <div class="summary-box">
              <p><strong>Report Generated:</strong> ${new Date().toLocaleString("en-GB", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "GMT",
              })} GMT</p>
            </div>

            <div class="section-title">Team Commission Tiers</div>
            <table>
              <thead>
                <tr>
                  <th>AE Name</th>
                  <th>Current Tier</th>
                  <th>Rate</th>
                  <th>Previous Tier</th>
                  <th>Change</th>
                  <th>Commission (GBP)</th>
                  <th>Deals</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>This is an automated report sent on the 10th of each month at 9 AM GMT.</p>
            <p>For questions, contact accounts@amfg.ai</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function generateTierReportPlainText(
  aeData: AETierData[],
  reportMonth: number,
  reportYear: number,
  previousMonth: number,
  previousYear: number
): string {
  const monthName = MONTH_NAMES[reportMonth - 1];
  const previousMonthName = MONTH_NAMES[previousMonth - 1];

  let text = `MONTHLY COMMISSION TIER REPORT\n`;
  text += `${monthName} ${reportYear} (Comparing to ${previousMonthName} ${previousYear})\n`;
  text += `${"=".repeat(80)}\n\n`;

  text += `${"AE Name".padEnd(20)} | ${"Tier".padEnd(8)} | ${"Rate".padEnd(6)} | ${"Prev".padEnd(8)} | ${"Change".padEnd(12)} | ${"Commission".padEnd(12)} | Deals\n`;
  text += `${"-".repeat(80)}\n`;

  for (const ae of aeData) {
    const change = getTierChangeIndicator(ae.currentTier, ae.previousTier);
    text += `${ae.name.padEnd(20)} | ${ae.currentTier.padEnd(8)} | ${(ae.currentRate * 100).toString().padEnd(6)}% | ${ae.previousTier.padEnd(8)} | ${change.padEnd(12)} | £${ae.totalCommissionGbp.toFixed(2).padEnd(12)} | ${ae.dealCount}\n`;
  }

  text += `\n${"=".repeat(80)}\n`;
  text += `Report generated: ${new Date().toLocaleString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "GMT",
  })} GMT\n`;

  return text;
}
