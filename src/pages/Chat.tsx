import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { copy } from "../copy";
import { questionsFor } from "../data/questions";
import { threadLeak } from "../lib/leak";
import { messageAuthorLabel, messageClock, PROMPT_AUTHOR } from "../lib/thread";
import { TopBar } from "../components/Chrome";
import { OpenPicture } from "../components/AfterViewer";
import { useVisitZone } from "../components/ZoneNav";
import { activePlan, activeProperty } from "../state/select";
import { useRenovate } from "../state/store";

export function QuestionsRedirect() {
  const { zoneId = "" } = useParams();
  return <Navigate to={`/zone/${zoneId}/chat?from=capture`} replace />;
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
  const [openPicture, setOpenPicture] = useState<string | null>(null);
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
          const label = messageAuthorLabel(message.authorId, ownerId);
          const chips =
            message.authorId === PROMPT_AUTHOR && message.questionId && message.chips && !answered.has(message.questionId)
              ? message.chips
              : [];
          return (
            <article key={message.id} className={mine ? "message mine" : "message"}>
              <p className="message-meta">
                <span>{label}</span>
                <time dateTime={message.createdAt}>{messageClock(message.createdAt)}</time>
              </p>
              <p className="message-text">{message.text}</p>
              {message.pictureId ? (
                <PictureThumb statePhotos={state.photos} proposals={state.proposals} pictureId={message.pictureId} onOpen={setOpenPicture} />
              ) : null}
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
      {openPicture ? (
        <OpenPicture
          kind={state.photos.some((photo) => photo.id === openPicture) ? "before" : "after"}
          planId={plan.id}
          zoneId={currentZone.id}
          pictureId={openPicture}
          imageUrl={
            state.photos.find((photo) => photo.id === openPicture)?.url ??
            state.proposals.find((item) => item.id === openPicture)?.imageUrl ??
            ""
          }
          place={1}
          total={1}
          onClose={() => setOpenPicture(null)}
          onMove={() => undefined}
        />
      ) : null}
    </div>
  );
}

function PictureThumb({
  statePhotos,
  proposals,
  pictureId,
  onOpen,
}: {
  statePhotos: { id: string; url: string }[];
  proposals: { id: string; imageUrl: string }[];
  pictureId: string;
  onOpen: (id: string) => void;
}) {
  const url = statePhotos.find((photo) => photo.id === pictureId)?.url ?? proposals.find((item) => item.id === pictureId)?.imageUrl;
  if (!url) return null;
  return (
    <button className="message-thumb-hit" type="button" onClick={() => onOpen(pictureId)} aria-label="Open picture">
      <img className="message-thumb" src={url} alt="" />
    </button>
  );
}
