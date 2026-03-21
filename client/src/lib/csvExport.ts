/**
 * CSV Export Utilities
 */

export function exportTeamCommissionsToCSV(
  data: {
    commissions: Array<{
      aeId: number;
      aeName: string;
      dealCount: number;
      payoutCount: number;
      totalNetGbp: number;
      totalNetUsd: number;
      payouts: Array<{
        customerName: string;
        payoutNumber: number;
        tier: string;
        netCommissionGbp: number;
        netCommissionUsd: number;
      }>;
    }>;
  },
  month: number,
  year: number
): void {
  const monthName = new Date(year, month - 1).toLocaleString("en-US", { month: "long" });
  const filename = `team-commissions-${monthName}-${year}.csv`;

  // Create CSV content
  const rows: string[] = [];

  // Header
  rows.push(`Team Commission Report - ${monthName} ${year}`);
  rows.push("");
  rows.push("Team Member,Deals,Payouts,Total GBP,Total USD");

  // Team summary
  for (const commission of data.commissions) {
    rows.push(
      `"${commission.aeName}",${commission.dealCount},${commission.payoutCount},${commission.totalNetGbp.toFixed(2)},${commission.totalNetUsd.toFixed(2)}`
    );

    // Individual payouts for this team member
    for (const payout of commission.payouts) {
      rows.push(
        `,"${payout.customerName}",${payout.payoutNumber},${payout.tier},${payout.netCommissionGbp.toFixed(2)},${payout.netCommissionUsd.toFixed(2)}`
      );
    }
    rows.push(""); // Blank line between team members
  }

  // Totals
  rows.push("");
  const totalGbp = data.commissions.reduce((sum, c) => sum + c.totalNetGbp, 0);
  const totalUsd = data.commissions.reduce((sum, c) => sum + c.totalNetUsd, 0);
  rows.push(`TOTAL,${data.commissions.length},,${totalGbp.toFixed(2)},${totalUsd.toFixed(2)}`);

  // Create blob and download
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
