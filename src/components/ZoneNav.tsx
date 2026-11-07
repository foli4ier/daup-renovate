import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { PillView, Sheet } from "./Chrome";
import { activePlan, activeProperty, visibleZones, zonePath, zonePill } from "../state/select";
import { useRenovate } from "../state/store";

export function useVisitZone(zoneId: string) {
  const { state, dispatch } = useRenovate();
  const plan = activePlan(state);
  const planId = plan?.id;
  const last = plan?.lastZoneId;
  useEffect(() => {
    if (!planId || !zoneId || last === zoneId) return;
    dispatch({ type: "visit-zone", planId, zoneId });
  }, [dispatch, planId, zoneId, last]);
}

export function useZoneSwipe(zoneId: string, enabled = true) {
  const navigate = useNavigate();
  const { state } = useRenovate();
  const origin = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!enabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button, a, input, textarea, select, label, .photo-row, .backdrop, .sheet")) return;
    origin.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = origin.current;
    origin.current = null;
    if (!start || !enabled) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy)) return;
    const current = stateRef.current;
    const plan = activePlan(current);
    const property = activeProperty(current);
    if (!plan || !property) return;
    const zones = visibleZones(current, property.id);
    const index = zones.findIndex((zone) => zone.id === zoneId);
    if (index < 0) return;
    const next = zones[index + (dx < 0 ? 1 : -1)];
    if (!next) return;
    navigate(zonePath(current, plan.id, next.id), { replace: true });
  }

  function onPointerCancel() {
    origin.current = null;
  }

  return { onPointerDown, onPointerUp, onPointerCancel };
}

export function ZonePicker({ zoneId, onClose }: { zoneId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { state } = useRenovate();
  const plan = activePlan(state);
  const property = activeProperty(state);
  if (!plan || !property) return null;
  const zones = visibleZones(state, property.id);

  function choose(id: string) {
    if (!plan) return;
    if (id !== zoneId) navigate(zonePath(state, plan.id, id), { replace: true });
    onClose();
  }

  return (
    <Sheet
      title={copy.pickZone}
      onClose={onClose}
      footer={
        <button className="btn btn-outline btn-wide" type="button" onClick={onClose}>
          {copy.close}
        </button>
      }
    >
      {zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          className="zone-row"
          aria-current={zone.id === zoneId ? "true" : undefined}
          onClick={() => choose(zone.id)}
        >
          <span>{zone.name}</span>
          <PillView pill={zonePill(state, plan.id, zone)} />
        </button>
      ))}
    </Sheet>
  );
}

export function useZonePicker(zoneId: string) {
  const [open, setOpen] = useState(false);
  const swipe = useZoneSwipe(zoneId, !open);
  useVisitZone(zoneId);
  return { open, setOpen, swipe, picker: open ? <ZonePicker zoneId={zoneId} onClose={() => setOpen(false)} /> : null };
}
