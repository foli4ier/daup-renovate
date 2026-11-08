import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { copy } from "../copy";
import { questionsFor } from "../data/questions";
import { threadLeak } from "../lib/leak";
import { PROMPT_AUTHOR } from "../lib/thread";
import { TopBar } from "../components/Chrome";
import { useVisitZone } from "../components/ZoneNav";
import { activePlan, activeProperty } from "../state/select";
import { useRenovate } from "../state/store";

export function QuestionsRedirect() {
  const { zoneId = "" } = useParams();
  return <Navigate to={`/zone/${zoneId}/chat?from=capture`} replace />;
}

function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { zoneId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useRenovate();
  const plan = activePlan(state);
  const property = activeProperty(state);
  const zone = state.zones.find((item) => item.id === zoneId);
  const ownerId = property?.ownerId ?? "";
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  useVisitZone(zoneId);

  useEffect(() => {
    if (!zoneId || !ownerId) return;
    dispatch({ type: "seed-thread", zoneId, ownerId, now: new Date().toISOString() });
  }, [dispatch, ownerId, zoneId]);

  if (!plan || !zone) {
    return (
      <div className="page">
        <TopBar />
        <p>That zone is not on this plan.</p>
      </div>
    );
  }

  const currentZone = zone;
  const from = params.get("from") === "gallery" ? "gallery" : "capture";
  const backTo = from === "gallery" ? `/gallery/${currentZone.id}` : `/zone/${currentZone.id}`;
  const messages = state.messages.filter((message) => message.zoneId === currentZone.id);
  const answered = new Set(currentZone.answers.filter((answer) => answer.text.trim()).map((answer) => answer.questionId));
  const pending = questionsFor(currentZone.key).find((question) => !answered.has(question.id));

  function send(text: string, questionId?: string, fromComposer = false) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (threadLeak(trimmed)) {
      setHint(copy.leakBlock);
      return;
    }
    setHint("");
    dispatch({
      type: "post-message",
      id: `msg_${crypto.randomUUID()}`,
      zoneId: currentZone.id,
      authorId: ownerId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      questionId,
    });
    if (fromComposer) setDraft("");
  }

  return (
    <div className="page has-composer">
      <TopBar title={currentZone.name} onBack={() => navigate(backTo, { replace: true })} />
      <div className="thread" id="thread" role="log" aria-label={currentZone.name}>
        {messages.map((message) => {
          const mine = message.authorId === ownerId;
          const label = mine ? "You" : message.authorId === PROMPT_AUTHOR ? null : message.authorId;
          const chips =
            message.authorId === PROMPT_AUTHOR && message.questionId && message.chips && !answered.has(message.questionId)
              ? message.chips
              : [];
          return (
            <article key={message.id} className={mine ? "message mine" : "message"}>
              <p className="message-meta">
                {label ? <span>{label}</span> : null}
                <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
              </p>
              <p className="message-text">{message.text}</p>
              {chips.length ? (
                <div className="message-chips">
                  {chips.map((chip) => (
                    <button key={chip} type="button" className="choice" onClick={() => send(chip, message.questionId)}>
                      {chip}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft, pending?.id, true);
        }}
      >
        {hint ? <p className="warn">{hint}</p> : null}
        <div className="composer-row">
          <input
            aria-label="Message"
            placeholder={copy.messagePlaceholder}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (hint) setHint("");
            }}
          />
          <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
            {copy.sendMessage}
          </button>
        </div>
      </form>
    </div>
  );
}
