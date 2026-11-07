import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { copy } from "../copy";
import { styleLabel, tierLabel } from "../data/guides";
import { ActionBar, BeforeAfter, Sheet, TopBar } from "../components/Chrome";
import { useZonePicker } from "../components/ZoneNav";
import { whatChanges } from "../lib/changes";
import { ABOUT_ONE_MEGAPIXEL, triesLeft } from "../lib/prompt";
import { activePlan, linkFor, photosFor, proposalsFor } from "../state/select";
import { useRenovate } from "../state/store";

export default function Gallery() {
  const { zoneId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch, busyZoneId } = useRenovate();
  const plan = activePlan(state);
  const picker = useZonePicker(zoneId);
  const [picked, setPicked] = useState<string | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [keepDraft, setKeepDraft] = useState("");

  if (!plan) {
    return (
      <div className="page">
        <TopBar />
        <p>{copy.startPlan}</p>
      </div>
    );
  }

  const currentPlan = plan;
  const zone = state.zones.find((item) => item.id === zoneId);
  const link = zone ? linkFor(state, plan.id, zone.id) : undefined;
  const pictures = zone ? proposalsFor(state, plan.id, zone.id) : [];
  const requested = params.get("picture");
  const approvedPicture = pictures.find((item) => item.id === link?.approvedProposalId);
  const current =
    pictures.find((item) => item.id === picked) ??
    pictures.find((item) => item.id === requested) ??
    approvedPicture ??
    pictures[pictures.length - 1];
  const before = current ? state.photos.find((photo) => photo.id === current.beforePhotoId) : photosFor(state, zone?.id ?? "")[0];
  const left = triesLeft(link?.attempts ?? 0);
  const hasUpload = pictures.some((item) => item.source === "uploaded");
  const showingUploaded = current?.source === "uploaded";
  const fromZone = link?.styleFromZoneId ? state.zones.find((item) => item.id === link.styleFromZoneId) : undefined;
  const changes = link ? whatChanges({ read: link.readLine, keep: link.keep, replace: link.replace }) : [];
  const smallAfter =
    showingUploaded && current?.width && current?.height && current.width * current.height < ABOUT_ONE_MEGAPIXEL
      ? copy.smallAfter(current.width, current.height)
      : "";
  const showingApproved = Boolean(current && link?.approvedProposalId === current.id);

  function saveKeepAndOpenCapture() {
    if (!zone || !link) return;
    const keep = keepDraft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    dispatch({
      type: "set-guides",
      planId: currentPlan.id,
      zoneId: zone.id,
      style: link.style,
      styleNote: link.styleNote,
      budget: link.budget,
      keep,
      replace: link.replace,
    });
    setDriftOpen(false);
    navigate(`/zone/${zone.id}`);
  }

  return (
    <div className={`page ${driftOpen ? "" : "has-skip"}`} {...picker.swipe}>
      <TopBar title={zone?.name} onTitle={zone ? () => picker.setOpen(true) : undefined} titleOpen={picker.open} />
      {current && before ? (
        <BeforeAfter before={before.url} after={current.imageUrl} />
      ) : link?.lastFailed ? (
        <p className="warn">{copy.failure}</p>
      ) : (
        <div className="ph">No picture yet</div>
      )}
      {smallAfter ? (
        <p className="photo-warn" style={{ marginTop: 10 }}>
          {smallAfter}
        </p>
      ) : null}
      {hasUpload && zone && link ? (
        <>
          <label className="field" htmlFor="what-we-read">
            {copy.whatWeRead}
            <textarea
              id="what-we-read"
              className="read-line"
              rows={3}
              value={link.readLine ?? ""}
              onChange={(event) =>
                dispatch({ type: "set-read-line", planId: currentPlan.id, zoneId: zone.id, text: event.target.value })
              }
            />
          </label>
          <button
            id="share-look"
            className="choice"
            type="button"
            style={{ width: "100%" }}
            aria-pressed={Boolean(link.shareLook)}
            onClick={() => dispatch({ type: "share-look", planId: currentPlan.id, zoneId: zone.id, on: !link.shareLook })}
          >
            {copy.useLook}
          </button>
          <p className="meta">{copy.useLookHelp}</p>
        </>
      ) : null}
      {link?.style && link.budget ? (
        <div className="chips" style={{ marginTop: 12 }}>
          <span className="choice" aria-pressed="true">
            {styleLabel(link.style, link.styleNote, link.style === "from-after" ? fromZone?.name : undefined)}
          </span>
          <span className="choice" aria-pressed="true">{tierLabel(link.budget)}</span>
        </div>
      ) : null}
      {changes.length ? (
        <>
          <h2 id="what-changes" style={{ marginTop: 16 }}>{copy.whatChanges}</h2>
          <ul className="changes">
            {changes.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {pictures.length ? (
        <div className="photo-row" id="proposal-thumbs" style={{ marginTop: 12 }}>
          {pictures.map((picture) => (
            <button
              key={picture.id}
              type="button"
              className="thumb"
              aria-pressed={picture.id === current?.id}
              onClick={() => setPicked(picture.id)}
            >
              <img src={picture.imageUrl} alt={picture.source === "uploaded" ? "Uploaded after" : "Generated after"} />
            </button>
          ))}
        </div>
      ) : null}
      {zone && link && !driftOpen ? (
        <div className="quiet-pair" id="gallery-actions">
          <button id="add-photos" className="btn btn-outline" type="button" onClick={() => navigate(`/zone/${zone.id}`)}>
            {copy.addPhotos}
          </button>
          <button id="try-again" className="btn btn-outline" type="button" onClick={() => navigate(`/zone/${zone.id}`)}>
            {copy.tryAgain}
          </button>
        </div>
      ) : null}
      {showingUploaded ? <p className="meta impression">{copy.uploadedAfter}</p> : <p className="meta impression">{copy.impression}</p>}
      {link?.lastFailed ? <p className="warn" style={{ marginTop: 10 }}>{copy.failure}</p> : null}
      {busyZoneId === zone?.id ? <p className="meta">{copy.making}</p> : null}
      {zone && link && !driftOpen ? (
        <button
          id="drift-link"
          className="text-btn drift-link"
          type="button"
          disabled={left === 0}
          onClick={() => {
            setKeepDraft(link.keep.join("\n"));
            setDriftOpen(true);
          }}
        >
          {copy.drift}
        </button>
      ) : null}

      {driftOpen || !zone || !link ? null : (
        <ActionBar>
          <button
            id="approve"
            className="btn btn-primary btn-wide"
            type="button"
            disabled={!current}
            aria-pressed={showingApproved}
            onClick={() => {
              if (!current || showingApproved) return;
              dispatch({ type: "approve", planId: plan.id, zoneId: zone.id, proposalId: current.id });
            }}
          >
            {showingApproved ? copy.approved : copy.approve}
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
        </ActionBar>
      )}

      {driftOpen && zone && link ? (
        <Sheet
          title={copy.drift}
          onClose={() => setDriftOpen(false)}
          footer={
            <button id="drift-try" className="btn btn-primary btn-wide" type="button" onClick={saveKeepAndOpenCapture}>
              {copy.tryAgain}
            </button>
          }
        >
          <p className="meta">Keep is filled in for the next try.</p>
          <label className="field">
            Keep
            <textarea value={keepDraft} onChange={(event) => setKeepDraft(event.target.value)} />
          </label>
        </Sheet>
      ) : null}
      {picker.picker}
    </div>
  );
}
