/**
 * emailService.test.ts
 * Unit tests for the Resend email service.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the env module so we can control RESEND_API_KEY
vi.mock("./_core/env", () => ({
  ENV: {
    resendApiKey: "",
  },
}));

// Mock resend module
const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendTierChangeEmail } from "./emailService";
import { ENV } from "./_core/env";

describe("sendTierChangeEmail", () => {
  const basePayload = {
    toEmail: "test@example.com",
    toName: "Test AE",
    previousTier: "bronze",
    newTier: "silver",
    month: 3,
    year: 2026,
    avgArrUsd: 22000,
    avgDemosPw: 3.5,
    avgDialsPw: 120,
    nextTierTargets: { arrUsd: 25000, demosPw: 4, dialsPw: 200 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset resendApiKey to empty
    (ENV as any).resendApiKey = "";
  });

  it("returns false and skips send when RESEND_API_KEY is not configured", async () => {
    (ENV as any).resendApiKey = "";
    const result = await sendTierChangeEmail(basePayload);
    expect(result).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns true on successful send", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: { id: "email-123" }, error: null });

    const result = await sendTierChangeEmail(basePayload);
    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("returns false when Resend returns an error", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: null, error: { message: "Invalid API key" } });

    const result = await sendTierChangeEmail(basePayload);
    expect(result).toBe(false);
  });

  it("returns false when Resend throws an exception", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockRejectedValueOnce(new Error("Network error"));

    const result = await sendTierChangeEmail(basePayload);
    expect(result).toBe(false);
  });

  it("sends correct subject for promotion", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: { id: "email-123" }, error: null });

    await sendTierChangeEmail({ ...basePayload, previousTier: "bronze", newTier: "silver" });

    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.subject).toContain("Silver");
    expect(callArgs.to).toEqual(["test@example.com"]);
  });

  it("sends correct subject for demotion", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: { id: "email-123" }, error: null });

    await sendTierChangeEmail({ ...basePayload, previousTier: "silver", newTier: "bronze" });

    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.subject).toContain("Bronze");
    expect(callArgs.to).toEqual(["test@example.com"]);
  });

  it("includes HTML content in the email", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: { id: "email-123" }, error: null });

    await sendTierChangeEmail(basePayload);

    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.html).toBeTruthy();
    expect(callArgs.html).toContain("AMFG Commission");
    expect(callArgs.html).toContain("Test"); // greeting uses first name only
  });

  it("handles null nextTierTargets (gold tier)", async () => {
    (ENV as any).resendApiKey = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: { id: "email-123" }, error: null });

    const result = await sendTierChangeEmail({
      ...basePayload,
      previousTier: "silver",
      newTier: "gold",
      nextTierTargets: null,
    });

    expect(result).toBe(true);
    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.html).toContain("top tier");
  });
});
