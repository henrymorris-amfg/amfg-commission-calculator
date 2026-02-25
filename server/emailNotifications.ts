import { invokeLLM } from "./server/_core/llm";

export interface TierChangeNotification {
  aeId: number;
  aeName: string;
  aeEmail: string;
  previousTier: "bronze" | "silver" | "gold";
  newTier: "bronze" | "silver" | "gold";
  month: number;
  year: number;
  metricsBreakdown: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  targetMetrics: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
}

/**
 * Send tier change notification email to AE
 * Uses the built-in LLM to generate a professional, personalized email
 */
export async function sendTierChangeEmail(notification: TierChangeNotification): Promise<boolean> {
  try {
    const tierLabels = {
      bronze: "Bronze (13% commission)",
      silver: "Silver (16% commission)",
      gold: "Gold (19% commission)",
    };

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const prompt = `Generate a professional, encouraging email to notify an AE about their tier change.

AE Name: ${notification.aeName}
Previous Tier: ${tierLabels[notification.previousTier]}
New Tier: ${tierLabels[notification.newTier]}
Month: ${monthNames[notification.month - 1]} ${notification.year}

Their metrics for this month:
- ARR: $${notification.metricsBreakdown.arrUsd.toLocaleString()}
- Demos/week: ${notification.metricsBreakdown.demosPw.toFixed(1)}
- Dials/week: ${notification.metricsBreakdown.dialsPw.toFixed(0)}

${notification.newTier} tier requirements:
- ARR: $${notification.targetMetrics.arrUsd.toLocaleString()}
- Demos/week: ${notification.targetMetrics.demosPw}
- Dials/week: ${notification.targetMetrics.dialsPw}

${notification.newTier > notification.previousTier 
  ? `The AE has been promoted. Write an encouraging email congratulating them on the achievement and explaining what the higher commission rate means for their earnings.`
  : `The AE has been demoted. Write a supportive email explaining what metrics they need to improve to get back to their previous tier, and offer encouragement.`
}

The email should:
1. Be warm and professional
2. Clearly explain the tier change and commission rate change
3. Show which metrics helped them succeed (or which need improvement)
4. Be 3-4 paragraphs max
5. End with motivation to keep performing well

Format as plain text email body (no subject line).`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert at writing professional, encouraging emails to sales team members." },
        { role: "user", content: prompt },
      ],
    });

    const emailBody = response.choices[0].message.content;

    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    // For now, log the email that would be sent
    console.log(`\n=== TIER CHANGE EMAIL ===`);
    console.log(`To: ${notification.aeEmail}`);
    console.log(`Subject: Tier Update: You're now ${tierLabels[notification.newTier]}`);
    console.log(`\n${emailBody}`);
    console.log(`=== END EMAIL ===\n`);

    return true;
  } catch (error) {
    console.error("Failed to send tier change email:", error);
    return false;
  }
}

/**
 * Check if AE's tier changed and send notification if needed
 */
export async function notifyTierChangeIfApplicable(
  aeId: number,
  aeName: string,
  aeEmail: string,
  previousTier: string | null,
  newTier: "bronze" | "silver" | "gold",
  month: number,
  year: number,
  metricsBreakdown: { arrUsd: number; demosPw: number; dialsPw: number },
  targetMetrics: { arrUsd: number; demosPw: number; dialsPw: number }
): Promise<void> {
  // Only send if tier actually changed
  if (!previousTier || previousTier === newTier) {
    return;
  }

  await sendTierChangeEmail({
    aeId,
    aeName,
    aeEmail,
    previousTier: previousTier as "bronze" | "silver" | "gold",
    newTier,
    month,
    year,
    metricsBreakdown,
    targetMetrics,
  });
}
