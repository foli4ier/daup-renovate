import { useState } from "react";
import { copy } from "../copy";
import { phaseRangeText, phaseSlice, phasesAddUpOver, type SpendZone } from "../lib/spend";
import { activePlan, linkFor, propertyZones } from "../state/select";
import { useRenovate } from "../state/store";
import type { SpendPhase } from "../state/types";
import { Sheet } from "./Chrome";

type Draft = {
  id: string;
  name: string;
  order: number;
  zoneIds: string[];
};

function PhaseTitle({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className="phase-rename"
        aria-label={copy.phaseName}
        value={name}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <button className="phase-rename" type="button" onClick={() => setEditing(true)}>
      {name.trim() || copy.phaseName}
    </button>
  );
}

export function SpendPhases() {
  const { state, dispatch } = useRenovate();
  const plan = activePlan(state);
  const [draft, setDraft] = useState<Draft | null>(null);
  if (!plan) return null;
  const currentPlan = plan;

  const phases = (currentPlan.spendPhases ?? []).slice().sort((a, b) => a.order - b.order);
  const zones = spendZones(state, currentPlan.id, currentPlan.propertyId);
  const slices = phases.map((phase) => phaseSlice(zones, phase.zoneIds));
  const over = phasesAddUpOver(slices, currentPlan.availableToSpend);

  function openNew() {
    const order = phases.reduce((max, phase) => Math.max(max, phase.order), 0) + 1;
    setDraft({
      id: `spend_${crypto.randomUUID()}`,
      name: `Phase ${phases.length + 1}`,
      order,
      zoneIds: [],
    });
  }

  function openEdit(phase: SpendPhase) {
    setDraft({ id: phase.id, name: phase.name, order: phase.order, zoneIds: [...phase.zoneIds] });
  }

  function toggleZone(zoneId: string) {
    setDraft((current) => {
      if (!current) return current;
      const zoneIds = current.zoneIds.includes(zoneId)
        ? current.zoneIds.filter((id) => id !== zoneId)
        : [...current.zoneIds, zoneId];
      return { ...current, zoneIds };
    });
  }

  function save() {
    if (!draft || !draft.name.trim() || draft.zoneIds.length === 0) return;
    dispatch({
      type: "save-spend-phase",
      planId: currentPlan.id,
      phase: { id: draft.id, name: draft.name, order: draft.order, zoneIds: draft.zoneIds },
    });
    setDraft(null);
  }

  const choices = zones.filter((zone) => !zone.hidden && !zone.skipped);

  return (
    <section className="spend-phases" aria-label="Spend phases">
      {phases.length === 0 ? (
        <button className="btn btn-outline btn-wide add-phase" type="button" onClick={openNew}>
          {copy.addPhase}
        </button>
      ) : (
        <div className="stack">
          {phases.map((phase, index) => {
            const slice = slices[index];
            if (!slice) return null;
            const range = slice.ready ? phaseRangeText(slice.low, slice.high, currentPlan.availableToSpend) : "";
            return (
              <article key={phase.id} className="card spend-card">
                <button className="spend-open" type="button" onClick={() => openEdit(phase)}>
                  <strong>{phase.name}</strong>
                  {slice.names.length ? <span className="spend-zones">{slice.names.join(" · ")}</span> : null}
                  {range ? <span className="spend-range">{range}</span> : null}
                  {slice.needsSize ? <span className="meta">{copy.addSizeForTotal}</span> : null}
                </button>
                <div className="spend-moves">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() =>
                      dispatch({ type: "move-spend-phase", planId: currentPlan.id, phaseId: phase.id, direction: "up" })
                    }
                  >
                    {copy.moveUp}
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() =>
                      dispatch({ type: "move-spend-phase", planId: currentPlan.id, phaseId: phase.id, direction: "down" })
                    }
                  >
                    {copy.moveDown}
                  </button>
                </div>
              </article>
            );
          })}
          {currentPlan.availableToSpend === undefined ? <p className="meta">{copy.addSpendOnBudget}</p> : null}
          {over ? <p className="spend-over">{copy.phasesOver}</p> : null}
          <button className="btn btn-outline btn-wide add-phase" type="button" onClick={openNew}>
            {copy.addPhase}
          </button>
        </div>
      )}
      {draft ? (
        <Sheet
          title={draft.name.trim() || copy.phaseName}
          heading={<PhaseTitle name={draft.name} onChange={(name) => setDraft({ ...draft, name })} />}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button
                className="btn btn-primary btn-wide"
                type="button"
                disabled={!draft.name.trim() || draft.zoneIds.length === 0}
                onClick={save}
              >
                {copy.addThisPhase}
              </button>
              <button className="text-btn" type="button" onClick={() => setDraft(null)}>
                {copy.close}
              </button>
            </>
          }
        >
          {choices.map((zone) => (
            <button
              key={zone.id}
              className="zone-row spend-zone"
              type="button"
              aria-pressed={draft.zoneIds.includes(zone.id)}
              onClick={() => toggleZone(zone.id)}
            >
              <span>{zone.name}</span>
            </button>
          ))}
        </Sheet>
      ) : null}
    </section>
  );
}

function spendZones(state: Parameters<typeof propertyZones>[0], planId: string, propertyId: string): SpendZone[] {
  return propertyZones(state, propertyId).map((zone) => ({
    id: zone.id,
    name: zone.name,
    key: zone.key,
    sizeM2: zone.sizeM2,
    hidden: zone.hidden,
    skipped: Boolean(linkFor(state, planId, zone.id)?.skipped),
  }));
}
