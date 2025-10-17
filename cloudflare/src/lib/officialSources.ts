const OFFICIAL_ROOTS = [
  // Issuers/banks (add more as needed)
  "hsbc.com",
  "hsbc.com.hk",
  "citi.com",
  "citibank.com",
  "sc.com",
  "hangseng.com",
  "americanexpress.com",
  "amex.com",
  "mox.com",
  "za.group",
  "za.bank",
  // Networks/regulators/government
  "visa.com",
  "mastercard.com",
  "americanexpress.com",
  "hkma.gov.hk",
  "mas.gov.sg",
  "fsc.gov.tw",
  "sec.gov.ph",
  "gov.hk",
];

export function isOfficialDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return OFFICIAL_ROOTS.some(root => h === root || h.endsWith(`.${root}`));
}

export function officialAllowlist(): string[] {
  return OFFICIAL_ROOTS.slice();
}
