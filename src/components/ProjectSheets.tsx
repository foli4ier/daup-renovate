import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { activePlan } from "../state/select";
import { useRenovate } from "../state/store";
import { Sheet } from "./Chrome";

export function PushSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { pushProject, state } = useRenovate();
  const plan = activePlan(state);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function push() {
    setFailed(false);
    const result = await pushProject();
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setUrl(result.url);
  }

  return (
    <Sheet
      title="Push to Project"
      onClose={onClose}
      footer={
        url ? (
          <a className="btn btn-primary btn-wide" href={url} target="_blank" rel="noopener noreferrer">
            {copy.openProject}
          </a>
        ) : (
          <button className="btn btn-primary btn-wide" type="button" onClick={() => void push()}>
            {copy.push}
          </button>
        )
      }
    >
      {url ? (
        <>
          <p>{copy.inProject}</p>
          <p className="meta">
            {plan?.name} is in DAUP Project. {copy.projectOpen}
          </p>
          <p>Next: {copy.sendNext}</p>
          <button
            className="text-btn"
            type="button"
            onClick={() => {
              onClose();
              navigate("/callout");
            }}
          >
            {copy.sendNext}
          </button>
        </>
      ) : (
        <>
          <p>{copy.projectNote}</p>
          {failed ? (
            <p className="warn" style={{ marginTop: 12 }}>
              {copy.nothingSent}
            </p>
          ) : null}
          <button className="text-btn" type="button" onClick={onClose}>
            {copy.notNow}
          </button>
        </>
      )}
    </Sheet>
  );
}
