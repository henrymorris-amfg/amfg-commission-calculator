/**
 * Shared AE authentication helpers.
 * Used by routers.ts, voipSync.ts, pipedriveSync.ts, spreadsheetSync.ts, and weeklySync.ts
 * to extract the AE ID from the X-AE-Token header (localStorage-based, production-safe).
 */

function parseAeToken(token: string): { aeId: number } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString());
    if (typeof payload.aeId !== "number") return null;
    return { aeId: payload.aeId };
  } catch {
    return null;
  }
}

export function makeAeToken(aeId: number): string {
  const payload = { aeId, ts: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

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
