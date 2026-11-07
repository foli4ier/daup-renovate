import { usableRead } from "./reading";

export const MODEL_KLEIN = "@cf/black-forest-labs/flux-2-klein-9b";
export const MODEL_VISION = "@cf/meta/llama-3.2-11b-vision-instruct";
export const PROPOSAL_CAP = 3;
export const ABOUT_ONE_MEGAPIXEL = 1_000_000;

export type StyleId = "budget-refresh" | "modern" | "keep-character" | "custom" | "from-after";
export type Tier = "low" | "mid" | "high";

export type PromptInput = {
  zoneName: string;
  style: StyleId;
  styleNote?: string;
  budget: Tier;
  keep: string[];
  replace: string[];
  answers: string[];
  drift: boolean;
};

export function capReached(attemptsUsed: number): boolean {
  return attemptsUsed >= PROPOSAL_CAP;
}

export function triesLeft(attemptsUsed: number): number {
  return Math.max(0, PROPOSAL_CAP - attemptsUsed);
}

export function buildEditPrompt(input: PromptInput): string {
  const read = usableRead(input.styleNote);
  const styleLine =
    input.style === "budget-refresh"
      ? "A light refresh: paint, small repairs, and tidy finishes."
      : input.style === "modern"
        ? "A modern finish with clean lines. Keep the same room."
        : input.style === "keep-character"
          ? "Keep the character of the place. Repair and freshen it."
          : input.style === "from-after"
            ? read
              ? `Match this look: ${read}`
              : "Match the finishes of the uploaded after."
            : input.styleNote?.trim() || "A careful refresh of the worn finishes.";
  const budgetLine =
    input.budget === "low"
      ? "Stay with paint and fixes. Do not rebuild the room."
      : input.budget === "mid"
        ? "New finishes. Same layout."
        : "Bigger changes are welcome. Same camera view.";
  const keep = input.keep.length
    ? input.keep.join("; ")
    : "the camera view, windows, doors, and structure";
  const replace = input.replace.length ? input.replace.join("; ") : "worn finishes only";
  const notes = input.answers.length ? input.answers.join("; ") : "Use a sensible best guess.";
  const drift = input.drift
    ? "The last edit changed things that must stay. Put those back. "
    : "";
  return [
    `${drift}Edit the photo. Keep the exact camera angle, framing, and structure.`,
    "Remove any people. Do not add words, numbers, logos, or watermarks.",
    `Zone: ${input.zoneName}.`,
    styleLine,
    budgetLine,
    `Keep: ${keep}.`,
    `Change: ${replace}.`,
    `Notes: ${notes}.`,
  ].join(" ");
}

/** Klein can take a second image. Image 0 stays the zone before. Image 1 is style only. */
export function withStyleReference(prompt: string, hasReference: boolean): string {
  if (!hasReference) return prompt;
  return [
    "Image 0 is the photo to edit. Keep its exact camera angle, framing, and structure.",
    "Image 1 is a style reference only. Do not copy the camera view or the room from image 1.",
    prompt,
  ].join(" ");
}
