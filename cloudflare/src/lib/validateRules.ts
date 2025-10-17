import type { CardRuleSet } from "./types";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  mappedCategories: string[];
}

const ALLOWED_CATEGORIES = new Set([
  "general",
  "dining",
  "groceries",
  "supermarket",  // Common in HK (超市)
  "online",
  "travel",
  "fuel",
  "welcome-offer",
]);

export function validateRuleset(ruleset: CardRuleSet): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // CRITICAL: Reject "Unknown Card" or very short names
  if (!ruleset.cardName || ruleset.cardName.length < 3 || 
      ruleset.cardName.toLowerCase().includes("unknown")) {
    issues.push({ 
      field: "cardName", 
      message: "Card name missing or invalid (found: " + ruleset.cardName + ")" 
    });
  }
  
  if (!ruleset.region) {
    issues.push({ field: "region", message: "Region is required" });
  }
  
  if (Number.isNaN(ruleset.baseRate) || ruleset.baseRate < 0) {
    issues.push({ field: "baseRate", message: "Base rate must be non-negative" });
  }
  
  // CRITICAL: Ensure minimum signal - must have EITHER a base rate or category rules
  if (ruleset.baseRate === 0 && ruleset.rules.length === 0) {
    issues.push({ 
      field: "rules", 
      message: "No reward information found. Must have baseRate > 0 or at least one category rule." 
    });
  }

  const mappedCategories: string[] = [];
  for (const rule of ruleset.rules) {
    if (!ALLOWED_CATEGORIES.has(rule.category)) {
      issues.push({ field: `rules.${rule.category}`, message: "Unknown category" });
    } else {
      mappedCategories.push(rule.category);
    }
    if (rule.rate < 0) {
      issues.push({ field: `rules.${rule.category}`, message: "Rate must be non-negative" });
    }
  }

  if (ruleset.annualFee != null && ruleset.annualFee < 0) {
    issues.push({ field: "annualFee", message: "Annual fee cannot be negative" });
  }
  if (ruleset.fxFee != null && ruleset.fxFee < 0) {
    issues.push({ field: "fxFee", message: "FX fee cannot be negative" });
  }

  return {
    valid: issues.length === 0,
    issues,
    mappedCategories,
  };
}
