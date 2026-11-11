import { questionsFor } from "../data/questions";
import type { State, ThreadMessage, Zone } from "../state/types";
import { threadLeak } from "./leak";

/** Questions are messages in the thread, not a person and not an assistant. */
export const PROMPT_AUTHOR = "prompt";

export function messageAuthorLabel(authorId: string, ownerId: string): string {
  if (authorId === ownerId) return "You";
  if (authorId === PROMPT_AUTHOR) return "Renovate";
  return authorId;
}

export function messageClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function promptId(zoneId: string, questionId: string): string {
  return `msg_${zoneId}_${questionId}`;
}

function seededReplyId(zoneId: string, questionId: string): string {
  return `msg_${zoneId}_${questionId}_owner`;
}

/**
 * Add missing question messages, and a reply for each answer already saved.
 * Leaves messages that are already there in place.
 */
export function ensureZoneThread(messages: ThreadMessage[], zone: Zone, ownerId: string, now: string): ThreadMessage[] {
  const mine = messages.filter((message) => message.zoneId === zone.id);
  const others = messages.filter((message) => message.zoneId !== zone.id);
  const next = mine.slice();
  let changed = false;

  for (const question of questionsFor(zone.key)) {
    let prompt = next.find((message) => message.questionId === question.id && message.authorId === PROMPT_AUTHOR);
    if (!prompt) {
      prompt = {
        id: promptId(zone.id, question.id),
        zoneId: zone.id,
        authorId: PROMPT_AUTHOR,
        text: question.prompt,
        createdAt: now,
        chips: question.options,
        questionId: question.id,
      };
      next.push(prompt);
      changed = true;
    }
    const answer = zone.answers.find((item) => item.questionId === question.id && item.text.trim());
    const replyIndex = next.findIndex((message) => message.questionId === question.id && message.authorId === ownerId);
    if (answer && replyIndex < 0) {
      const promptIndex = next.findIndex((message) => message.id === prompt.id);
      const reply: ThreadMessage = {
        id: seededReplyId(zone.id, question.id),
        zoneId: zone.id,
        authorId: ownerId,
        text: answer.text,
        createdAt: now,
        questionId: question.id,
      };
      next.splice(Math.max(0, promptIndex) + 1, 0, reply);
      changed = true;
    }
  }

  return changed ? [...others, ...next] : messages;
}

export function seedZoneThread(state: State, zoneId: string, ownerId: string, now: string): State {
  const zone = state.zones.find((item) => item.id === zoneId);
  if (!zone) return state;
  const messages = ensureZoneThread(state.messages, zone, ownerId, now);
  if (messages === state.messages) return state;
  return { ...state, messages };
}

export function postThreadMessage(
  state: State,
  action: {
    id: string;
    zoneId: string;
    authorId: string;
    text: string;
    createdAt: string;
    questionId?: string;
    pictureId?: string;
  },
): State {
  const text = action.text.trim();
  if (!text || threadLeak(text)) return state;
  const zone = state.zones.find((item) => item.id === action.zoneId);
  if (!zone) return state;
  const questionId =
    action.questionId && questionsFor(zone.key).some((question) => question.id === action.questionId)
      ? action.questionId
      : undefined;
  const pictureId = !questionId && action.pictureId?.trim() ? action.pictureId.trim() : undefined;
  const messages = appendThreadMessage(state.messages, {
    id: action.id,
    zoneId: zone.id,
    authorId: action.authorId,
    text,
    createdAt: action.createdAt,
    ...(questionId ? { questionId } : {}),
    ...(pictureId ? { pictureId } : {}),
  });
  const zones = questionId
    ? state.zones.map((item) => {
        if (item.id !== zone.id) return item;
        const answers = item.answers.filter((answer) => answer.questionId !== questionId);
        return { ...item, answers: [...answers, { questionId, text }] };
      })
    : state.zones;
  if (messages === state.messages && zones === state.zones) return state;
  return { ...state, messages, zones };
}

function appendThreadMessage(messages: ThreadMessage[], message: ThreadMessage): ThreadMessage[] {
  if (messages.some((item) => item.id === message.id)) return messages;
  if (!message.questionId) return [...messages, message];
  const promptIndex = messages.findIndex(
    (item) => item.zoneId === message.zoneId && item.questionId === message.questionId && item.authorId === PROMPT_AUTHOR,
  );
  if (promptIndex < 0) return [...messages, message];
  const replyIndex = messages.findIndex(
    (item) => item.zoneId === message.zoneId && item.questionId === message.questionId && item.authorId === message.authorId,
  );
  if (replyIndex >= 0) {
    const current = messages[replyIndex];
    if (!current || current.text === message.text) return messages;
    return messages.map((item, index) => (index === replyIndex ? { ...item, text: message.text, createdAt: message.createdAt } : item));
  }
  const next = messages.slice();
  next.splice(promptIndex + 1, 0, message);
  return next;
}
