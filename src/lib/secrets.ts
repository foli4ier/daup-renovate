/** Hub one-time proof. Shape from the house seed (`hr_…`). */
export const HOUSE_REDEEM_PATTERN = /hr_[A-Za-z0-9_-]{16,}/i;

const HOUSE_REDEEM_EXACT = /^hr_[A-Za-z0-9_-]{16,128}$/;

export function isHouseRedeem(value: string): boolean {
  return HOUSE_REDEEM_EXACT.test(value.trim());
}

export function containsHouseRedeem(text: string): boolean {
  return /houseRedeem/i.test(text) || HOUSE_REDEEM_PATTERN.test(text);
}

/** Safe for console, CallOut, and error text. The token is replaced, never printed. */
export function redactSecrets(text: string): string {
  return text
    .replace(/houseRedeem=[^&\s#]+/gi, "houseRedeem=redacted")
    .replace(HOUSE_REDEEM_PATTERN, "hr_redacted");
}

export function carriesHouseRedeem(value: unknown): boolean {
  try {
    const text = JSON.stringify(value);
    if (typeof text !== "string") return true;
    return containsHouseRedeem(text);
  } catch {
    return true;
  }
}

/** Fields a client may write to a log. The token itself is never one of them. */
export function loggableHandoff(input: {
  emailHint?: string;
  houseHint?: string;
  placeIdHints?: string[];
  houseRedeem?: string;
}): string {
  return JSON.stringify({
    emailHint: input.emailHint ?? "",
    houseHint: input.houseHint ?? "",
    placeIdHints: input.placeIdHints ?? [],
    houseRedeem: input.houseRedeem ? "present" : "absent",
  });
}
