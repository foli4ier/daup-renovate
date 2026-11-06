import { useState } from "react";
import { copy } from "../copy";
import { Sheet } from "../components/Chrome";
import { activeProperty, propertyZones } from "../state/select";
import { useRenovate } from "../state/store";
import type { Zone, ZoneKind } from "../state/types";

export function EditZones({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useRenovate();
  const property = activeProperty(state);
  const zones = property ? propertyZones(state, property.id) : [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<ZoneKind>("inside");
  const [merge, setMerge] = useState<{ source: Zone; targetId: string } | null>(null);
  const target = zones.find((zone) => zone.id === merge?.targetId);

  function add() {
    if (!property || !draftName.trim()) return;
    const order = Math.max(0, ...state.zones.map((zone) => zone.order)) + 1;
    const zone: Zone = {
      id: `zone_${crypto.randomUUID()}`,
      propertyId: property.id,
      key: `custom_${order}`,
      name: draftName.trim(),
      kind: draftKind,
      order,
      hidden: false,
      answers: [],
    };
    dispatch({ type: "add-zone", zone });
    setDraftName("");
    setAdding(false);
  }

  return (
    <Sheet
      title={copy.editTitle}
      onClose={onClose}
      footer={
        merge && target ? (
          <button
            className="btn btn-primary btn-wide"
            type="button"
            onClick={() => {
              dispatch({ type: "merge-zones", sourceId: merge.source.id, targetId: target.id });
              setMerge(null);
            }}
          >
            {copy.merge}
          </button>
        ) : (
          <>
            {adding ? (
              <div>
                <label className="field">
                  Name
                  <input value={draftName} placeholder={copy.placeholderName} onChange={(event) => setDraftName(event.target.value)} />
                </label>
                <div className="chips">
                  {(["outside", "inside"] as const).map((kind) => (
                    <button key={kind} type="button" className="choice" aria-pressed={draftKind === kind} onClick={() => setDraftKind(kind)}>
                      {kind === "outside" ? "Outside." : "Inside."}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button className="btn btn-outline btn-wide" type="button" onClick={() => (adding ? add() : setAdding(true))}>
              {copy.addZone}
            </button>
            <button className="btn btn-primary btn-wide" type="button" onClick={onClose}>
              {copy.done}
            </button>
          </>
        )
      }
    >
      {merge && target ? (
        <>
          <p>{copy.mergeAsk(merge.source.name, target.name)}</p>
          <p>{copy.photosKept}</p>
          <button className="text-btn" type="button" onClick={() => setMerge(null)}>
            {copy.notNow}
          </button>
        </>
      ) : (
        <>
          <p className="meta">{copy.zonesStay}</p>
          {zones.map((zone) => (
            <div key={zone.id}>
              <button
                className="zone-row"
                type="button"
                aria-expanded={openId === zone.id}
                onClick={() => setOpenId(openId === zone.id ? null : zone.id)}
              >
                <span>{zone.name}</span>
                <span className="meta">
                  {zone.kind === "outside" ? "Outside" : "Inside"}
                  {zone.hidden ? " · Hidden" : ""}
                </span>
              </button>
              {openId === zone.id ? (
                <div className="zone-edit">
                  <label className="field">
                    Name
                    <input
                      value={zone.name}
                      placeholder={copy.placeholderName}
                      onChange={(event) => dispatch({ type: "rename-zone", zoneId: zone.id, name: event.target.value })}
                    />
                  </label>
                  <div className="chips" role="group" aria-label="Inside or outside">
                    {(["outside", "inside"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className="choice"
                        aria-pressed={zone.kind === kind}
                        onClick={() => dispatch({ type: "set-zone-kind", zoneId: zone.id, kind })}
                      >
                        {kind === "outside" ? "Outside." : "Inside."}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    Size in m²
                    <input
                      inputMode="decimal"
                      value={zone.sizeM2 ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        if (!raw) {
                          dispatch({ type: "set-zone-size", zoneId: zone.id });
                          return;
                        }
                        const size = Number(raw);
                        if (Number.isFinite(size) && size > 0) dispatch({ type: "set-zone-size", zoneId: zone.id, sizeM2: size });
                      }}
                    />
                  </label>
                  <div className="row">
                    <button className="icon-btn" type="button" onClick={() => dispatch({ type: "move-zone", zoneId: zone.id, direction: "up" })}>
                      {copy.moveUp}
                    </button>
                    <button className="icon-btn" type="button" onClick={() => dispatch({ type: "move-zone", zoneId: zone.id, direction: "down" })}>
                      {copy.moveDown}
                    </button>
                    <button className="icon-btn" type="button" onClick={() => dispatch({ type: "hide-zone", zoneId: zone.id, hidden: !zone.hidden })}>
                      {zone.hidden ? "Show." : "Hide."}
                    </button>
                  </div>
                  <label className="field">
                    Merge into
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) setMerge({ source: zone, targetId: event.target.value });
                      }}
                    >
                      <option value="">Choose a zone</option>
                      {zones
                        .filter((item) => item.id !== zone.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}
