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
  "online",
  "travel",
  "fuel",
  "welcome-offer",
]);

export function validateRuleset(ruleset: CardRuleSet): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!ruleset.cardName || ruleset.cardName.length < 3) {
    issues.push({ field: "cardName", message: "Card name appears invalid" });
  }
  if (!ruleset.region) {
    issues.push({ field: "region", message: "Region is required" });
  }
  if (Number.isNaN(ruleset.baseRate) || ruleset.baseRate < 0) {
    issues.push({ field: "baseRate", message: "Base rate must be non-negative" });
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
