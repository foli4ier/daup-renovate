import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { copy } from "../copy";
import { AddZoneFields } from "../components/AddZone";
import { ActionBar, PillView, Sheet, StepRail, Wordmark } from "../components/Chrome";
import { makeCustomZone } from "../data/zones";
import { activePlan, activeProperty, approvedCount, photosFor, propertyZones, zoneListLabel, zonePath, zonePill } from "../state/select";
import { useRenovate } from "../state/store";
import type { ZoneKind } from "../state/types";
import { EditZones } from "./EditZones";

export default function Zones() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { state, dispatch } = useRenovate();
  const property = activeProperty(state);
  const plan = activePlan(state);
  const editing = params.get("edit") === "1";
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<ZoneKind | undefined>(undefined);
  const [peek, setPeek] = useState<string | null>(null);
  const held = useRef(false);
  const holdTimer = useRef<number | null>(null);

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
  const house = property;
  const zones = propertyZones(state, house.id);
  const visible = zones.filter((zone) => !zone.hidden);
  const hidden = zones.filter((zone) => zone.hidden);
  const counts = approvedCount(state, plan);
  const settledLabel = zoneListLabel(state);

  function openZone(zoneId: string) {
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    navigate(zonePath(state, currentPlan.id, zone.id));
  }

  function addZone() {
    const name = draftName.trim();
    if (!name) return;
    const zone = makeCustomZone(house.id, state.zones, name, draftKind);
    dispatch({ type: "add-zone", zone });
    setDraftName("");
    setDraftKind(undefined);
    setAdding(false);
    navigate(`/zone/${zone.id}`);
  }

  return (
    <div className={`page ${editing || adding || !settledLabel ? "" : "has-action"}`}>
      <Wordmark />
      <p className="kicker">{copy.zonesWord}</p>
      <h1>{plan.name}</h1>
      <p className="meta">{copy.progress(counts.approved, counts.total)}</p>
      <button className="text-btn" type="button" onClick={() => setParams({ edit: "1" })}>
        {copy.editZones}
      </button>
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
                <StepRail pill={pill} />
                <PillView pill={pill} />
                {pill === "approved" ? <span className="meta">{copy.holdBefore}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <button id="add-zone" className="btn btn-outline btn-wide add-zone" type="button" onClick={() => setAdding(true)}>
        {copy.addZone}
      </button>
      {hidden.length ? (
        <button className="text-btn" type="button" onClick={() => setHiddenOpen((open) => !open)}>
          {copy.hidden(hidden.length)}
        </button>
      ) : null}
      {hiddenOpen
        ? hidden.map((zone) => (
            <button key={zone.id} className="zone-row" type="button" onClick={() => openZone(zone.id)}>
              <span>{zone.name}</span>
              <PillView pill={zonePill(state, plan.id, zone)} />
            </button>
          ))
        : null}
      {editing || adding || !settledLabel ? null : (
        <ActionBar>
          <button className="btn btn-primary btn-wide" type="button" onClick={() => navigate("/budget")}>
            {settledLabel}
          </button>
        </ActionBar>
      )}
      {editing ? <EditZones onClose={() => setParams({})} /> : null}
      {adding ? (
        <Sheet
          title={copy.addZone}
          onClose={() => {
            setAdding(false);
            setDraftName("");
            setDraftKind(undefined);
          }}
          footer={
            <button className="btn btn-primary btn-wide" type="button" disabled={!draftName.trim()} onClick={addZone}>
              {copy.addZone}
            </button>
          }
        >
          <AddZoneFields name={draftName} kind={draftKind} onName={setDraftName} onKind={setDraftKind} />
        </Sheet>
      ) : null}
    </div>
  );
}
