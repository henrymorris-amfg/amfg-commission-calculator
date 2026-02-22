/**
 * Shared AE authentication helpers.
 * Used by routers.ts, voipSync.ts, pipedriveSync.ts, spreadsheetSync.ts, and weeklySync.ts
 * to extract the AE ID from the X-AE-Token header (localStorage-based, production-safe).
 *
 * Token format: base64url(JSON payload).base64url(HMAC-SHA256 signature)
 * The HMAC prevents token forgery — only the server (with JWT_SECRET) can produce valid tokens.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { ENV } from "./_core/env";

function getSecret(): string {
  return ENV.cookieSecret || "fallback-dev-secret";
}

/**
 * Parse and verify an HMAC-signed AE session token.
 * Returns null if the token is missing, malformed, or has an invalid signature.
 */
function parseAeToken(token: string): { aeId: number } | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const payload = token.substring(0, dotIdx);
    const sig = token.substring(dotIdx + 1);

    // Verify HMAC signature using timing-safe comparison
    const expectedSig = createHmac("sha256", getSecret())
      .update(payload)
      .digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed.aeId !== "number") return null;
    return { aeId: parsed.aeId };
  } catch {
    return null;
  }
}

/**
 * Create an HMAC-signed AE session token for the given AE ID.
 */
export function makeAeToken(aeId: number): string {
  const payload = Buffer.from(JSON.stringify({ aeId, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Extract the AE ID from the request context.
 * Checks X-AE-Token header first (localStorage-based), then falls back to cookie.
 */
export function getAeIdFromCtx(ctx: {
  req: { headers: Record<string, string | string[] | undefined> };
}): number | null {
  // Primary: X-AE-Token header (localStorage-based, production-safe)
  const headerToken = ctx.req.headers["x-ae-token"] as string | undefined;
  if (headerToken) {
    const parsed = parseAeToken(headerToken);
    if (parsed) return parsed.aeId;
  }
  // Fallback: cookie (backward compatibility)
  const cookieHeader = ctx.req.headers["cookie"] as string | undefined;
  if (cookieHeader) {
    const match = cookieHeader.match(/ae_session=([^;]+)/);
    if (match?.[1]) {
      const parsed = parseAeToken(match[1]);
      if (parsed) return parsed.aeId;
    }
  }
  return null;
}
