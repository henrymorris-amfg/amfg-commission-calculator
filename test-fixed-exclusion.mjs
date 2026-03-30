#!/usr/bin/env node

/**
 * Test the fixed exclusion logic
 */

// Old exclusion logic (buggy)
const OLD_KEYWORDS = [
  "implementation",
  "customer success",
  "onboarding",
  "cs ",
  "- cs",
];

function isOldExcluded(title) {
  const lower = title.toLowerCase();
  return OLD_KEYWORDS.some((kw) => lower.includes(kw));
}

// New exclusion logic (fixed)
const NEW_KEYWORDS = [
  "implementation",
  "customer success",
  " cs ",
  "onboarding",
  "- cs",
];

function isNewExcluded(title) {
  const lower = " " + title.toLowerCase() + " ";
  return NEW_KEYWORDS.some((kw) => lower.includes(kw));
}

console.log("\n=== Testing Exclusion Logic Fix ===\n");

const testCases = [
  "Roechling Plastics (UK) deal",
  "RBD Engineers PVT LTD - (CNC) Implementation",
  "Five Star Plastics (2026) (License fees)",
  "Precision Composites Ltd",
  "Account CS - Support",
];

testCases.forEach((title) => {
  const oldResult = isOldExcluded(title);
  const newResult = isNewExcluded(title);
  const fixed = oldResult !== newResult ? " ✓ FIXED" : "";
  console.log(`"${title}"`);
  console.log(`  Old: ${oldResult ? "EXCLUDED" : "INCLUDED"}`);
  console.log(`  New: ${newResult ? "EXCLUDED" : "INCLUDED"}${fixed}`);
  console.log();
});
