import { useState } from "react";
import { copy } from "../copy";
import { activePlan } from "../state/select";
import { useRenovate } from "../state/store";
import { Sheet } from "./Chrome";

export function PushSheet({ onClose }: { onClose: () => void }) {
  const { pushProject, state } = useRenovate();
  const plan = activePlan(state);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  async function push() {
    setFailed(false);
    const result = await pushProject();
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setDone(true);
  }

  return (
    <Sheet title="Push to Project" onClose={onClose}>
      {done ? (
        <>
          <p>{copy.inProject}</p>
          <p className="meta">{plan?.name} is in DAUP Project. {copy.projectOpen}</p>
          <button className="btn btn-primary btn-wide" type="button" onClick={onClose} style={{ marginTop: 16 }}>
            {copy.close}
          </button>
        </>
      ) : (
        <>
          <p>{copy.projectNote}</p>
          {failed ? <p className="warn" style={{ marginTop: 12 }}>{copy.nothingSent}</p> : null}
          <button className="btn btn-primary btn-wide" type="button" onClick={() => void push()} style={{ marginTop: 16 }}>
            {copy.push}
          </button>
          <button className="text-btn" type="button" onClick={onClose}>
            {copy.notNow}
          </button>
        </>
      )}
    </Sheet>
  );
}

export function ProjectSheet({ onClose }: { onClose: () => void }) {
  const plan = activePlan(useRenovate().state);
  return (
    <Sheet title="In Project" onClose={onClose}>
      <p>
        {plan?.name} is in DAUP Project. {copy.projectOpen}
      </p>
      <button className="btn btn-primary btn-wide" type="button" onClick={onClose} style={{ marginTop: 16 }}>
        {copy.close}
      </button>
    </Sheet>
  );
}
