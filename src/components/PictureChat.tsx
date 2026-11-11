import { useState } from "react";
import { Link } from "react-router-dom";
import { copy } from "../copy";
import { threadLeak } from "../lib/leak";
import { activeProperty } from "../state/select";
import { useRenovate } from "../state/store";

export function PictureChat({ zoneId, pictureId, onClose }: { zoneId: string; pictureId: string; onClose: () => void }) {
  const { state, dispatch } = useRenovate();
  const ownerId = activeProperty(state)?.ownerId ?? "";
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const messages = state.messages.filter((message) => message.zoneId === zoneId && message.pictureId === pictureId);

  function send() {
    const text = draft.trim();
    if (!text || !ownerId) return;
    if (threadLeak(text)) {
      setHint(copy.leakBlock);
      return;
    }
    setHint("");
    dispatch({
      type: "post-message",
      id: `msg_${crypto.randomUUID()}`,
      zoneId,
      authorId: ownerId,
      text,
      createdAt: new Date().toISOString(),
      pictureId,
    });
    setDraft("");
  }

  return (
    <div className="picture-chat" role="dialog" aria-label={copy.chat}>
      <div className="picture-chat-log" role="log">
        {messages.map((message) => (
          <p key={message.id} className="picture-chat-line">
            {message.text}
          </p>
        ))}
      </div>
      {hint ? <p className="warn">{hint}</p> : null}
      <form
        className="picture-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          aria-label="Message"
          placeholder={copy.picturePlaceholder}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (hint) setHint("");
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
          {copy.sendMessage}
        </button>
      </form>
      <Link className="text-btn" to={`/zone/${zoneId}/chat?from=gallery`} onClick={onClose}>
        {copy.wholeZoneChat}
      </Link>
    </div>
  );
}
