/**
 * AE token utilities - separated from aeAuth.ts to avoid circular dependencies
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
    console.log('[parseAeToken] Token:', token.substring(0, 20) + '...');
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) {
      console.log('[parseAeToken] No dot found');
      return null;
    }
    const payload = token.substring(0, dotIdx);
    const sig = token.substring(dotIdx + 1);

    // Verify HMAC signature using timing-safe comparison
    const expectedSig = createHmac("sha256", getSecret())
      .update(payload)
      .digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) {
      console.log('[parseAeToken] Signature length mismatch', sigBuf.length, expectedBuf.length);
      return null;
    }
    if (!timingSafeEqual(sigBuf, expectedBuf)) {
      console.log('[parseAeToken] Signature verification failed');
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed.aeId !== "number") return null;
    return { aeId: parsed.aeId };
  } catch {
    return null;
  }
}

/**
 * Extract the AE ID from the request context.
 * Checks X-AE-Token header first (localStorage-based), then falls back to cookie.
 */
export function getAeIdFromCtx(ctx: {
  req: { headers: Record<string, string | string[] | undefined> };
}): number | null {
  console.log('[getAeIdFromCtx] Checking headers for authentication');
  const headerToken = ctx.req.headers["x-ae-token"] as string | undefined;
  console.log('[getAeIdFromCtx] X-AE-Token header present:', !!headerToken);
  if (headerToken) {
    console.log('[getAeIdFromCtx] Parsing X-AE-Token header');
    const parsed = parseAeToken(headerToken);
    if (parsed) {
      console.log('[getAeIdFromCtx] Successfully parsed aeId from header:', parsed.aeId);
      return parsed.aeId;
    }
    console.log('[getAeIdFromCtx] Failed to parse X-AE-Token header');
  }
  const cookieHeader = ctx.req.headers["cookie"] as string | undefined;
  console.log('[getAeIdFromCtx] Cookie header present:', !!cookieHeader);
  if (cookieHeader) {
    const match = cookieHeader.match(/ae_session=([^;]+)/);
    if (match?.[1]) {
      console.log('[getAeIdFromCtx] Parsing ae_session cookie');
      const parsed = parseAeToken(match[1]);
      if (parsed) {
        console.log('[getAeIdFromCtx] Successfully parsed aeId from cookie:', parsed.aeId);
        return parsed.aeId;
      }
      console.log('[getAeIdFromCtx] Failed to parse ae_session cookie');
    }
  }
  console.log('[getAeIdFromCtx] No valid authentication found - returning null');
  return null;
}
