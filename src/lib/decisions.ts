import { findLeak } from "./leak";
import type { Decision, DecisionColumn, State } from "../state/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One plain line from picture-chat messages. Price lines are left out. */
export function summarizePictureChat(texts: string[]): string {
  const clauses: string[] = [];
  for (const text of texts) {
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact || findLeak(compact)) continue;
    const first = (compact.split(/(?<=[.!?])\s+/)[0] ?? compact).replace(/[.!?]+$/, "").trim();
    if (!first) continue;
    if (clauses.some((item) => item.toLowerCase() === first.toLowerCase())) continue;
    clauses.push(first);
  }
  const recent = clauses.slice(-3);
  if (!recent.length) return "";
  const line = recent
    .map((clause, index) => (index === 0 ? clause : clause.charAt(0).toLowerCase() + clause.slice(1)))
    .join(", ");
  const capped = line.length > 140 ? `${line.slice(0, 137).trim()}…` : line;
  return /[.!?…]$/.test(capped) ? capped : `${capped}.`;
}

export function decisionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = MONTHS[date.getUTCMonth()] ?? "";
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

export type DecisionMoveRole = "primary" | "outline" | "quiet";

export type DecisionMove = { column: DecisionColumn; role: DecisionMoveRole };

/**
 * One terracotta primary (Approve.), one outline (Reject.), Archive. as a text link.
 * On Approved, Rejected, or Archived, Back to backlog. is the outline control
 * in place of the move for the column the card is already in.
 */
export function decisionSheetMoves(column: DecisionColumn): DecisionMove[] {
  const slots: DecisionMove[] = [
    { column: "approved", role: "primary" },
    { column: "rejected", role: "outline" },
    { column: "archived", role: "quiet" },
  ];
  if (column === "backlog") return slots;
  return slots.map((slot) => (slot.column === column ? { column: "backlog", role: "outline" } : slot));
}

/** Fold one picture-chat message into a suggested backlog card. Does not approve a picture. */
export function suggestFromPictureChat(state: State, input: { zoneId: string; pictureId: string; messageId: string }): State {
  const planId = state.activePlanId;
  if (!planId) return state;
  const related = state.messages.filter(
    (message) => message.zoneId === input.zoneId && message.pictureId === input.pictureId && !message.questionId,
  );
  const line = summarizePictureChat(related.map((message) => message.text));
  if (!line || findLeak(line)) return state;
  const createdAt = related.find((message) => message.id === input.messageId)?.createdAt ?? related[0]?.createdAt ?? "";
  return {
    ...state,
    plans: state.plans.map((plan) => {
      if (plan.id !== planId) return plan;
      const decisions = plan.decisions ?? [];
      const open = decisions.find((item) => item.pictureId === input.pictureId && item.column === "backlog" && item.suggested);
      if (open) {
        if (open.messageIds.includes(input.messageId)) return plan;
        return {
          ...plan,
          decisions: decisions.map((item) =>
            item.id === open.id
              ? {
                  ...item,
                  line: item.edited ? item.line : line,
                  messageIds: [...item.messageIds, input.messageId],
                }
              : item,
          ),
        };
      }
      const decision: Decision = {
        id: `decision_${input.messageId}`,
        zoneId: input.zoneId,
        pictureId: input.pictureId,
        line,
        column: "backlog",
        suggested: true,
        createdAt,
        messageIds: [input.messageId],
      };
      return { ...plan, decisions: [...decisions, decision] };
    }),
  };
}
