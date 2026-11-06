import { useRef, useState } from "react";
import { copy } from "../copy";
import { ActionBar, TopBar } from "../components/Chrome";
import { PushSheet } from "../components/ProjectSheets";
import { activePlan, phaseRows, zonesSettled } from "../state/select";
import { useRenovate } from "../state/store";

export default function Work() {
  const { state, dispatch } = useRenovate();
  const plan = activePlan(state);
  const [editing, setEditing] = useState<string | null>(null);
  const [push, setPush] = useState(false);
  const timer = useRef<number | null>(null);

  if (!plan) {
    return (
      <div className="page">
        <TopBar />
        <p>{copy.startPlan}</p>
      </div>
    );
  }

  const rows = phaseRows(state, plan);
  const ready = zonesSettled(state, plan) && rows.some((row) => row.zoneNames.length > 0);
  const label = plan.status === "draft" ? copy.approvePlan : copy.push;

  return (
    <div className={`page ${push ? "" : "has-action"}`}>
      <TopBar title={plan.name} />
      <p className="kicker">Work</p>
      <p className="meta">{copy.pressHold}</p>
      <div className="stack" style={{ marginTop: 12 }}>
        {rows.map((row) => (
          <article
            key={row.phase.id}
            className="card phase"
            onPointerDown={() => {
              if (plan.status !== "draft") return;
              timer.current = window.setTimeout(() => setEditing(row.phase.id), 450);
            }}
            onPointerUp={() => {
              if (timer.current) window.clearTimeout(timer.current);
            }}
            onPointerLeave={() => {
              if (timer.current) window.clearTimeout(timer.current);
            }}
          >
            <div className="phase-no">{row.index}</div>
            <div>
              <h3>{row.phase.name}</h3>
              <p className="meta">{row.zoneNames.length ? row.zoneNames.join(", ") : copy.noZoneYet}</p>
              <p className="meta">{copy.aboutDays(row.phase.days)}</p>
              <p className="meta">{copy.startsAfter(row.starts)}</p>
              {row.phase.alongside ? <p className="meta">{row.phase.alongside}</p> : null}
              {editing === row.phase.id && plan.status === "draft" ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="icon-btn" type="button" onClick={() => dispatch({ type: "move-phase", planId: plan.id, phaseId: row.phase.id, direction: "up" })}>
                    Up.
                  </button>
                  <button className="icon-btn" type="button" onClick={() => dispatch({ type: "move-phase", planId: plan.id, phaseId: row.phase.id, direction: "down" })}>
                    Down.
                  </button>
                  <button className="icon-btn" type="button" onClick={() => dispatch({ type: "set-phase-days", planId: plan.id, phaseId: row.phase.id, days: row.phase.days - 1 })}>
                    −
                  </button>
                  <button className="icon-btn" type="button" onClick={() => dispatch({ type: "set-phase-days", planId: plan.id, phaseId: row.phase.id, days: row.phase.days + 1 })}>
                    +
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!ready && plan.status === "draft" ? <p className="meta">{copy.finishZones}</p> : null}
      {push ? null : (
        <ActionBar>
          <button
            className="btn btn-primary btn-wide"
            type="button"
            disabled={plan.status === "draft" && !ready}
            onClick={() => {
              if (plan.status === "draft") {
                dispatch({ type: "approve-plan", planId: plan.id });
                setPush(true);
                return;
              }
              setPush(true);
            }}
          >
            {label}
          </button>
        </ActionBar>
      )}
      {push ? <PushSheet onClose={() => setPush(false)} /> : null}
    </div>
  );
}
