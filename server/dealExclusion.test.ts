import { describe, it, expect } from "vitest";

// Copy of the exclusion logic from pipedriveSync.ts
const DEAL_EXCLUSION_KEYWORDS = [
  "implementation",
  "customer success",
  " cs ", // Customer Success (with spaces to avoid matching "plastics")
  "onboarding",
  "- cs",
];

function isDealExcluded(title: string): boolean {
  const lower = " " + title.toLowerCase() + " "; // Add spaces to match word boundaries
  return DEAL_EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
}

describe("Deal Exclusion Filter", () => {
  describe("should exclude implementation/onboarding/CS deals", () => {
    it("excludes deals with 'implementation' in title", () => {
      expect(isDealExcluded("RBD Engineers PVT LTD - (CNC) Implementation")).toBe(
        true
      );
    });

    it("excludes deals with 'onboarding' in title", () => {
      expect(isDealExcluded("Customer Onboarding - Setup")).toBe(true);
    });

    it("excludes deals with 'customer success' in title", () => {
      expect(isDealExcluded("Customer Success - Expansion")).toBe(true);
    });

    it("excludes deals with ' cs ' (word boundary) in title", () => {
      expect(isDealExcluded("Account CS - Support")).toBe(true);
    });

    it("excludes deals with '- cs' in title", () => {
      expect(isDealExcluded("Account - CS Support")).toBe(true);
    });
  });

  describe("should NOT exclude legitimate deals", () => {
    it("includes Roechling Plastics deal (should not match 'cs ' in 'plastics')", () => {
      expect(isDealExcluded("Roechling Plastics (UK) deal")).toBe(false);
    });

    it("includes deals with 'cs' at the end of a word", () => {
      expect(isDealExcluded("Plastics Manufacturing Inc.")).toBe(false);
    });

    it("includes normal deal titles", () => {
      expect(isDealExcluded("JODDB deal")).toBe(false);
      expect(isDealExcluded("Printerior deal")).toBe(false);
      expect(isDealExcluded("Advanced 3D, Inc")).toBe(false);
    });

    it("includes deals with 'cs' in company name", () => {
      expect(isDealExcluded("Lucas Manufacturing")).toBe(false);
      expect(isDealExcluded("Precision Composites Ltd")).toBe(false);
    });
  });
});
