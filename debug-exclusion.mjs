#!/usr/bin/env node

const DEAL_EXCLUSION_KEYWORDS = [
  "implementation",
  "customer success",
  "onboarding",
  "cs ",
  "- cs",
];

function isDealExcluded(title) {
  const lower = title.toLowerCase();
  console.log(`Testing: "${title}"`);
  console.log(`Lowercase: "${lower}"`);
  
  for (const kw of DEAL_EXCLUSION_KEYWORDS) {
    if (lower.includes(kw)) {
      console.log(`  ✓ MATCHED keyword: "${kw}"`);
      return true;
    }
  }
  
  console.log(`  ✗ No keywords matched`);
  return false;
}

// Test the Roechling title
const title = "Roechling Plastics (UK) deal";
const result = isDealExcluded(title);
console.log(`\nResult: ${result ? "EXCLUDED" : "INCLUDED"}`);
