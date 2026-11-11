import { useState } from "react";
import { Link } from "react-router-dom";
import { copy } from "../copy";
import { Sheet, Wordmark } from "../components/Chrome";
import { decisionDate, decisionMoves } from "../lib/decisions";
import { activePlan } from "../state/select";
import { useRenovate } from "../state/store";
import type { Decision, DecisionColumn } from "../state/types";

const COLUMNS: DecisionColumn[] = ["backlog", "approved", "rejected", "archived"];

const COLUMN_LABEL: Record<DecisionColumn, string> = {
  backlog: "Backlog",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

const MOVE_LABEL: Record<DecisionColumn, string> = {
  approved: copy.approve,
  rejected: copy.reject,
  archived: copy.archive,
  backlog: copy.backToBacklog,
};

export default function Decisions() {
  const { state, dispatch } = useRenovate();
  const plan = activePlan(state);
  const [column, setColumn] = useState<DecisionColumn>("backlog");
  const [openId, setOpenId] = useState<string | null>(null);
  const [line, setLine] = useState("");

  if (!plan) {
    return (
      <div className="page">
        <Wordmark />
        <h1>{copy.decisions}</h1>
        <p>{copy.startPlan}</p>
      </div>
    );
  }
  const currentPlan = plan;

  const decisions = currentPlan.decisions ?? [];
  const counts = Object.fromEntries(COLUMNS.map((item) => [item, decisions.filter((decision) => decision.column === item).length])) as Record<
    DecisionColumn,
    number
  >;
  const shown = decisions.filter((decision) => decision.column === column);
  const open = decisions.find((decision) => decision.id === openId) ?? null;

  function openCard(decision: Decision) {
    setOpenId(decision.id);
    setLine(decision.line);
  }

  function saveLine() {
    const next = line.replace(/\s+/g, " ").trim();
    if (!next || !open) return;
    dispatch({ type: "set-decision-line", planId: currentPlan.id, decisionId: open.id, line: next });
  }

  return (
    <div className="page">
      <Wordmark />
      <h1>{copy.decisions}</h1>
      <div className="segments" role="tablist" aria-label={copy.decisions}>
        {COLUMNS.map((item) => (
          <button
            key={item}
            className="segment"
            type="button"
            role="tab"
            aria-selected={column === item}
            onClick={() => setColumn(item)}
          >
            {COLUMN_LABEL[item]} {counts[item]}
          </button>
        ))}
      </div>
      {shown.length === 0 && column === "backlog" ? (
        <div className="decision-empty">
          <p>{copy.decisionEmpty}</p>
          <Link className="btn btn-outline" to="/plan">
            {copy.zones}
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {shown.map((decision) => {
            const zone = state.zones.find((item) => item.id === decision.zoneId);
            const url =
              state.photos.find((photo) => photo.id === decision.pictureId)?.url ??
              state.proposals.find((item) => item.id === decision.pictureId)?.imageUrl;
            return (
              <button key={decision.id} className="decision-card" type="button" onClick={() => openCard(decision)}>
                {url ? <img className="decision-thumb" src={url} alt="" /> : <span className="decision-thumb ph" />}
                <span className="decision-copy">
                  <span className="decision-line">{decision.line}</span>
                  <span className="meta">{zone?.name}</span>
                  <span className="meta">{copy.fromChat(decisionDate(decision.createdAt))}</span>
                  {decision.suggested ? <span className="suggested">{copy.suggested}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {open ? (
        <Sheet
          title={state.zones.find((item) => item.id === open.zoneId)?.name ?? copy.decisions}
          onClose={() => setOpenId(null)}
          footer={
            <div className="stack">
              {decisionMoves(open.column).map((item) => (
                <button
                  key={item}
                  className="btn btn-primary btn-wide"
                  type="button"
                  onClick={() => {
                    saveLine();
                    dispatch({ type: "move-decision", planId: currentPlan.id, decisionId: open.id, column: item });
                    setColumn(item);
                    setOpenId(null);
                  }}
                >
                  {MOVE_LABEL[item]}
                </button>
              ))}
            </div>
          }
        >
          <label className="field">
            Decision
            <textarea value={line} rows={3} onChange={(event) => setLine(event.target.value)} onBlur={saveLine} />
          </label>
          <Link className="text-btn" to={`/zone/${open.zoneId}/chat?from=decisions`}>
            {copy.seeChat}
          </Link>
        </Sheet>
      ) : null}
    </div>
  );
}
