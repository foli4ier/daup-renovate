import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { copy } from "../copy";
import { styleLabel, tierLabel } from "../data/guides";
import { BeforeAfter, TopBar } from "../components/Chrome";
import { triesLeft } from "../lib/prompt";
import { activePlan, linkFor, photosFor, planNext, proposalsFor, stepHref, visibleZones, zonePill } from "../state/select";
import { useRenovate } from "../state/store";
import { Sheet } from "../components/Chrome";

export default function Gallery() {
  const { zoneId = "" } = useParams();
  const navigate = useNavigate();
  const { state, dispatch, generate, busyZoneId } = useRenovate();
  const plan = activePlan(state);
  const scroller = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(zoneId);
  const [selected, setSelected] = useState<string | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftNote, setDriftNote] = useState("");
  const slides = plan ? visibleZones(state, plan.propertyId).filter((zone) => proposalsFor(state, plan.id, zone.id).length > 0 || zone.id === zoneId) : [];

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const slide = root.querySelector<HTMLElement>(`[data-zone="${zoneId}"]`);
    slide?.scrollIntoView({ inline: "start" });
  }, [zoneId]);

  if (!plan) {
    return (
      <div className="page">
        <TopBar />
        <p>{copy.startPlan}</p>
      </div>
    );
  }

  const currentPlan = plan;
  const zone = state.zones.find((item) => item.id === activeId) ?? state.zones.find((item) => item.id === zoneId);
  const link = zone ? linkFor(state, plan.id, zone.id) : undefined;
  const pictures = zone ? proposalsFor(state, plan.id, zone.id) : [];
  const current = pictures.find((item) => item.id === selected) ?? pictures[pictures.length - 1];
  const before = current ? state.photos.find((photo) => photo.id === current.beforePhotoId) : photosFor(state, zone?.id ?? "")[0];
  const left = triesLeft(link?.attempts ?? 0);
  const next = planNext(state);

  function onScroll() {
    const root = scroller.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>("[data-zone]")];
    const mid = root.scrollLeft + root.clientWidth / 2;
    const hit = slides.find((slide) => slide.offsetLeft <= mid && slide.offsetLeft + slide.offsetWidth >= mid);
    if (hit?.dataset.zone) {
      setActiveId(hit.dataset.zone);
      setSelected(null);
    }
  }

  async function retry(note?: string) {
    if (!zone || !link || left === 0) return;
    if (note) dispatch({ type: "add-keep", planId: currentPlan.id, zoneId: zone.id, text: note });
    setDriftOpen(false);
    const result = await generate(zone.id, { drift: Boolean(note) });
    if (result.ok) setSelected(null);
  }

  return (
    <div className={`page ${driftOpen ? "" : "has-stack"}`}>
      <TopBar title={zone?.name} />
      <div className="snap" ref={scroller} onScroll={onScroll}>
        {slides.map((slide) => {
          const pics = proposalsFor(state, plan.id, slide.id);
          const chosen = slide.id === zone?.id ? current ?? pics[pics.length - 1] : pics[pics.length - 1];
          const shot = chosen ? state.photos.find((photo) => photo.id === chosen.beforePhotoId) : undefined;
          const failed = linkFor(state, plan.id, slide.id)?.lastFailed;
          return (
            <section key={slide.id} className="snap-slide" data-zone={slide.id}>
              {chosen && shot ? (
                <BeforeAfter before={shot.url} after={chosen.imageUrl} />
              ) : failed ? (
                <p className="warn">{copy.failure}</p>
              ) : (
                <div className="ph">No picture yet</div>
              )}
            </section>
          );
        })}
      </div>
      {link?.style && link.budget ? (
        <div className="chips" style={{ marginTop: 12 }}>
          <span className="choice" aria-pressed="true">{styleLabel(link.style, link.styleNote)}</span>
          <span className="choice" aria-pressed="true">{tierLabel(link.budget)}</span>
        </div>
      ) : null}
      {link && link.replace.length ? (
        <>
          <h2 style={{ marginTop: 16 }}>{copy.whatChanges}</h2>
          <ul className="changes">
            {link.replace.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {pictures.length > 1 ? (
        <div className="photo-row" style={{ marginTop: 12 }}>
          {pictures.map((picture) => (
            <button
              key={picture.id}
              type="button"
              className="thumb"
              aria-pressed={picture.id === current?.id}
              onClick={() => setSelected(picture.id)}
            >
              <img src={picture.imageUrl} alt="" />
            </button>
          ))}
        </div>
      ) : null}
      {link?.lastFailed ? <p className="warn" style={{ marginTop: 10 }}>{copy.failure}</p> : null}
      {busyZoneId === zone?.id ? <p className="meta">{copy.making}</p> : null}

      {driftOpen || !zone || !link ? null : (
        <div className="action-stack">
          <p className="meta impression">{copy.impression}</p>
          <button className="text-btn" type="button" onClick={() => setDriftOpen(true)} disabled={left === 0}>
            {copy.drift}
          </button>
          <button
            className="btn btn-primary btn-wide"
            type="button"
            disabled={!current}
            onClick={() => {
              if (!current) return;
              if (zonePill(state, plan.id, zone) === "approved" && link.approvedProposalId === current.id) {
                const href = stepHref(next);
                if (href) navigate(href);
                return;
              }
              dispatch({ type: "approve", planId: plan.id, zoneId: zone.id, proposalId: current.id });
            }}
          >
            {current && link.approvedProposalId === current.id ? next.label : copy.approve}
          </button>
          <button className="btn btn-outline btn-wide" type="button" disabled={left === 0 || busyZoneId === zone.id} onClick={() => void retry()}>
            {copy.tryAgain(left)}
          </button>
          <button
            className="text-btn"
            type="button"
            onClick={() => {
              dispatch({ type: "skip-zone", planId: plan.id, zoneId: zone.id });
              navigate("/plan");
            }}
          >
            {copy.skipZone}
          </button>
        </div>
      )}

      {driftOpen && zone ? (
        <Sheet title={copy.drift} onClose={() => setDriftOpen(false)}>
          <p className="meta">It stays on the next try.</p>
          <div className="chips" style={{ margin: "12px 0" }}>
            {link?.keep.map((item) => (
              <span key={item} className="choice" aria-pressed="true">{item}</span>
            ))}
          </div>
          <label className="field">
            What should stay
            <input value={driftNote} onChange={(event) => setDriftNote(event.target.value)} />
          </label>
          <button
            className="btn btn-primary btn-wide"
            type="button"
            disabled={!driftNote.trim() || left === 0}
            onClick={() => void retry(driftNote.trim())}
          >
            {copy.tryAgain(left)}
          </button>
        </Sheet>
      ) : null}
      {before ? <span className="sr-only">{before.url}</span> : null}
    </div>
  );
}
