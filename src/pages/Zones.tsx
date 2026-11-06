import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { copy } from "../copy";
import { ActionBar, Wordmark } from "../components/Chrome";
import { PillView } from "../components/Chrome";
import { PushSheet } from "../components/ProjectSheets";
import { stepHref } from "../state/select";
import { activePlan, activeProperty, approvedCount, photosFor, planNext, propertyZones, zonePill } from "../state/select";
import { useRenovate } from "../state/store";
import { EditZones } from "./EditZones";

export default function Zones() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { state } = useRenovate();
  const property = activeProperty(state);
  const plan = activePlan(state);
  const editing = params.get("edit") === "1";
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const held = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const [sheet, setSheet] = useState<"push" | null>(null);
  const next = planNext(state);

  if (!property || !plan) {
    return (
      <div className="page has-action">
        <Wordmark />
        <p>{property ? copy.emptyPlan(property.name) : copy.emptyProperties}</p>
        <ActionBar>
          <button className="btn btn-primary btn-wide" type="button" onClick={() => navigate("/")}>
            {copy.startPlan}
          </button>
        </ActionBar>
      </div>
    );
  }

  const currentPlan = plan;
  const zones = propertyZones(state, property.id);
  const visible = zones.filter((zone) => !zone.hidden);
  const hidden = zones.filter((zone) => zone.hidden);
  const counts = approvedCount(state, plan);

  function openZone(zoneId: string) {
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    const pill = zonePill(state, currentPlan.id, zone);
    if (pill === "review" || pill === "approved") navigate(`/gallery/${zoneId}`);
    else if (pill === "questions") navigate(`/zone/${zoneId}/questions`);
    else navigate(`/zone/${zoneId}`);
  }

  function follow() {
    if (next.kind === "push") {
      setSheet("push");
      return;
    }
    if (next.kind === "project" && currentPlan.projectUrl) {
      window.open(currentPlan.projectUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const href = stepHref(next);
    if (href) navigate(href);
    else navigate("/");
  }

  return (
    <div className={`page ${editing || sheet ? "" : "has-action"}`}>
      <Wordmark />
      <p className="kicker">Plan</p>
      <h1>{plan.name}</h1>
      <p className="meta">{copy.progress(counts.approved, counts.total)}</p>
      <button className="text-btn" type="button" onClick={() => setParams({ edit: "1" })}>
        {copy.editZones}
      </button>
      {hidden.length ? (
        <button className="text-btn" type="button" onClick={() => setHiddenOpen((open) => !open)}>
          {copy.hidden(hidden.length)}
        </button>
      ) : null}
      {hiddenOpen ? (
        <ul>
          {hidden.map((zone) => (
            <li key={zone.id}>{zone.name}</li>
          ))}
        </ul>
      ) : null}
      <div className="zone-grid">
        {visible.map((zone) => {
          const photos = photosFor(state, zone.id);
          const pill = zonePill(state, plan.id, zone);
          const linkApproved = state.links.find((link) => link.planId === plan.id && link.zoneId === zone.id)?.approvedProposalId;
          const after = state.proposals.find((item) => item.id === linkApproved);
          const before = photos.find((photo) => photo.starred) ?? photos[0];
          const showAfter = pill === "approved" && after && peek !== zone.id;
          const src = showAfter ? after.imageUrl : before?.url;
          return (
            <div
              key={zone.id}
              className="zone-tile"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (held.current) {
                  held.current = false;
                  setPeek(null);
                  return;
                }
                openZone(zone.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openZone(zone.id);
                }
              }}
              onPointerDown={() => {
                held.current = false;
                if (pill !== "approved") return;
                holdTimer.current = window.setTimeout(() => {
                  held.current = true;
                  setPeek(zone.id);
                }, 280);
              }}
              onPointerUp={() => {
                if (holdTimer.current) window.clearTimeout(holdTimer.current);
                setPeek(null);
              }}
              onPointerLeave={() => {
                if (holdTimer.current) window.clearTimeout(holdTimer.current);
                setPeek(null);
              }}
            >
              {src ? <img src={src} alt="" /> : <div className="ph">No photo</div>}
              <div className="tile-copy">
                <h3>{zone.name}</h3>
                <PillView pill={pill} />
                {pill === "approved" ? <span className="meta">{copy.holdBefore}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      {editing || sheet ? null : (
        <ActionBar>
          <button className="btn btn-primary btn-wide" type="button" onClick={follow}>
            {next.label}
          </button>
        </ActionBar>
      )}
      {editing ? <EditZones onClose={() => setParams({})} /> : null}
      {sheet === "push" ? <PushSheet onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
