import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { copy } from "../copy";
import { SUGGESTIONS, STYLE_CHIPS, TIER_CHIPS } from "../data/guides";
import { needsQuestions } from "../data/questions";
import { ABOUT_ONE_MEGAPIXEL, capReached, triesLeft, type StyleId, type Tier } from "../lib/prompt";
import { canOfferAfterUpload } from "../lib/reading";
import { TopBar } from "../components/Chrome";
import { useZonePicker } from "../components/ZoneNav";
import { activePlan, linkFor, photosFor, proposalsFor } from "../state/select";
import { useRenovate } from "../state/store";

const PHOTO_CAP = 6;

function measure(file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const url = String(reader.result);
      const image = new Image();
      image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("image"));
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}

export default function Capture() {
  const { zoneId = "" } = useParams();
  const navigate = useNavigate();
  const { state, dispatch, addPhoto, saveGuides, uploadAfter, generate, busyZoneId, busyMode } = useRenovate();
  const plan = activePlan(state);
  const zone = state.zones.find((item) => item.id === zoneId);
  const link = plan ? linkFor(state, plan.id, zoneId) : undefined;
  const photos = photosFor(state, zoneId);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<StyleId | undefined>(link?.style);
  const [styleNote, setStyleNote] = useState(link?.readLine ?? link?.styleNote ?? "");
  const [budget, setBudget] = useState<Tier | undefined>(link?.budget);
  const [keep, setKeep] = useState<string[]>(link?.keep ?? []);
  const [replace, setReplace] = useState<string[]>(link?.replace ?? []);
  const [ownKeep, setOwnKeep] = useState("");
  const [ownReplace, setOwnReplace] = useState("");
  const [used, setUsed] = useState("");
  const [photoError, setPhotoError] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [keepNote, setKeepNote] = useState(false);
  const picker = useZonePicker(zoneId);
  const suggestions = SUGGESTIONS[zone?.key ?? ""] ?? { keep: [], replace: [] };
  const hasBefore = canOfferAfterUpload(photos.length);

  useEffect(() => {
    setStyle(link?.style);
    setStyleNote(link?.readLine ?? link?.styleNote ?? "");
    setBudget(link?.budget);
    setKeep(link?.keep ?? []);
    setReplace(link?.replace ?? []);
    setUsed("");
    setUploadError(false);
  }, [zoneId]);

  if (!plan || !zone || !link) {
    return (
      <div className="page">
        <TopBar />
        <p>That zone is not on this plan.</p>
      </div>
    );
  }

  const currentPlan = plan;
  const currentZone = zone;
  const currentLink = link;
  const fromZone = currentLink.styleFromZoneId
    ? state.zones.find((item) => item.id === currentLink.styleFromZoneId)
    : undefined;
  const hasUpload = state.proposals.some(
    (item) => item.planId === currentPlan.id && item.zoneId === zoneId && item.source === "uploaded",
  );
  const showFrom = hasUpload || style === "from-after" || Boolean(currentLink.styleFromZoneId);
  const fromLabel = currentLink.styleFromZoneId && fromZone ? copy.fromZone(fromZone.name) : copy.fromYourAfter;

  function persist(next?: { style?: StyleId; styleNote?: string; budget?: Tier; keep?: string[]; replace?: string[] }) {
    saveGuides(zoneId, {
      style: next?.style ?? style,
      styleNote: next?.styleNote ?? styleNote,
      budget: next?.budget ?? budget,
      keep: next?.keep ?? keep,
      replace: next?.replace ?? replace,
    });
  }

  async function addFiles(list: FileList | null) {
    const file = list?.[0];
    if (!file || photos.length >= PHOTO_CAP) return;
    setPhotoError(false);
    let measured: { url: string; width: number; height: number };
    try {
      measured = await measure(file);
    } catch {
      setPhotoError(true);
      return;
    }
    addPhoto({
      id: `photo_${crypto.randomUUID()}`,
      zoneId,
      url: measured.url,
      width: measured.width,
      height: measured.height,
      starred: photos.length === 0,
    });
  }

  async function onUploadAfter(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!canOfferAfterUpload(photos.length)) return;
    setUploadError(false);
    let measured: { url: string; width: number; height: number };
    try {
      measured = await measure(file);
    } catch {
      setUploadError(true);
      return;
    }
    const result = await uploadAfter(zoneId, measured);
    if (!result.ok) {
      setUploadError(true);
      return;
    }
    navigate(`/gallery/${zoneId}?picture=${result.proposalId}`);
  }

  function toggle(list: string[], value: string, kind: "keep" | "replace") {
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    if (kind === "keep") setKeep(next);
    else setReplace(next);
    persist(kind === "keep" ? { keep: next } : { replace: next });
  }

  async function onGenerate() {
    persist();
    if (capReached(currentLink.attempts)) return;
    if (needsQuestions(currentZone.key, currentZone.answers)) {
      dispatch({ type: "questions-pending", planId: currentPlan.id, zoneId, pending: true });
      navigate(`/zone/${zoneId}/questions`);
      return;
    }
    const result = await generate(zoneId);
    if (result.ok) navigate(`/gallery/${zoneId}?picture=${result.proposalId}`);
  }

  const ready = Boolean(style && (style !== "custom" || styleNote.trim()) && budget && photos.length);
  const small = photos.filter((photo) => photo.width * photo.height < ABOUT_ONE_MEGAPIXEL);
  const reading = busyZoneId === zoneId && busyMode === "read";
  const making = busyZoneId === zoneId && busyMode === "generate";
  const hasAfters = proposalsFor(state, currentPlan.id, zoneId).length > 0;
  const left = triesLeft(currentLink.attempts);

  return (
    <div className="page" {...picker.swipe}>
      <TopBar
        title={zone.name}
        onTitle={() => picker.setOpen(true)}
        titleOpen={picker.open}
        extra={
          hasAfters ? (
            <button
              id="see-afters"
              className="text-btn see-afters"
              type="button"
              onClick={() => navigate(`/gallery/${zoneId}`, { replace: true })}
            >
              {copy.seeAfters}
            </button>
          ) : null
        }
      />
      <div className="photo-row">
        {photos.map((photo) => (
          <div key={photo.id} className={photo.starred ? "thumb starred" : "thumb"}>
            <img src={photo.url} alt="" />
            <button
              className="star"
              type="button"
              aria-pressed={photo.starred}
              aria-label={photo.starred ? "Main photo" : "Make this the main photo"}
              onClick={() => dispatch({ type: "star-photo", zoneId, photoId: photo.id })}
            >
              {photo.starred ? "★" : "☆"}
            </button>
            <button
              className="text-btn"
              type="button"
              onClick={() => {
                if (photos.length <= 1 && hasAfters) {
                  setKeepNote(true);
                  return;
                }
                setKeepNote(false);
                dispatch({ type: "remove-photo", photoId: photo.id });
              }}
            >
              Remove.
            </button>
          </div>
        ))}
      </div>
      {photos.some((photo) => photo.starred) ? <p className="meta">{copy.mainPhoto}</p> : null}
      {keepNote ? <p className="meta">{copy.keepBefore}</p> : null}
      {small.map((photo) => (
        <p key={photo.id} className="photo-warn" style={{ marginTop: 10 }}>
          {copy.smallPhoto(photo.width, photo.height)}
        </p>
      ))}
      {photoError ? <p className="warn">{copy.photoRead}</p> : null}
      {photos.length >= PHOTO_CAP ? (
        <p className="meta">{copy.sixLimit}</p>
      ) : (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-outline" type="button" onClick={() => cameraRef.current?.click()}>
            {copy.takePhoto}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => uploadRef.current?.click()}>
            {copy.uploadPhoto}
          </button>
          <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => void addFiles(event.target.files)} />
          <input ref={uploadRef} className="sr-only" type="file" accept="image/*" onChange={(event) => void addFiles(event.target.files)} />
        </div>
      )}

      {hasBefore ? null : <p className="meta">{copy.addPhotosTo(zone.name)}</p>}
      <p style={{ marginTop: 16 }}>{copy.tip}</p>
      <p className="meta">{copy.people}</p>

      <h2 style={{ marginTop: 22 }}>Style</h2>
      <div className="chips" style={{ marginTop: 8 }}>
        {showFrom ? (
          <button
            type="button"
            className="choice"
            aria-pressed={style === "from-after"}
            onClick={() => {
              setStyle("from-after");
              const note = currentLink.readLine ?? currentLink.styleNote ?? styleNote;
              setStyleNote(note);
              persist({ style: "from-after", styleNote: note });
            }}
          >
            {fromLabel}
          </button>
        ) : null}
        {STYLE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="choice"
            aria-pressed={style === chip.id}
            onClick={() => {
              setStyle(chip.id);
              persist({ style: chip.id });
            }}
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          className="choice"
          aria-pressed={style === "custom"}
          onClick={() => {
            setStyle("custom");
            persist({ style: "custom" });
          }}
        >
          {copy.describe}
        </button>
      </div>
      {style === "from-after" ? (
        <label className="field">
          {copy.whatWeRead}
          <textarea
            className="read-line"
            rows={3}
            value={styleNote}
            aria-label={copy.whatWeRead}
            onChange={(event) => {
              const text = event.target.value;
              setStyleNote(text);
              if (currentLink.styleFromZoneId) persist({ style: "from-after", styleNote: text });
              else dispatch({ type: "set-read-line", planId: currentPlan.id, zoneId, text });
            }}
          />
        </label>
      ) : null}
      {style === "custom" ? (
        <label className="field">
          Your words
          <textarea
            value={styleNote}
            onChange={(event) => {
              setStyleNote(event.target.value);
              persist({ style: "custom", styleNote: event.target.value });
            }}
          />
        </label>
      ) : null}

      <h2 style={{ marginTop: 18 }}>Budget</h2>
      <div className="tier-row" style={{ marginTop: 8 }}>
        {TIER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="tier"
            aria-pressed={budget === chip.id}
            onClick={() => {
              setBudget(chip.id);
              persist({ budget: chip.id });
            }}
          >
            {chip.label}
            <span>{chip.hint}</span>
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 18 }}>Keep</h2>
      <p className="meta">{copy.keepOptional}</p>
      <div className="chips" style={{ marginTop: 8 }}>
        {[...new Set([...suggestions.keep, ...keep])].map((item) => (
          <button key={item} type="button" className="choice" aria-pressed={keep.includes(item)} onClick={() => toggle(keep, item, "keep")}>
            {item}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          const text = ownKeep.trim();
          if (!text) return;
          const next = [...keep, text];
          setKeep(next);
          setOwnKeep("");
          persist({ keep: next });
        }}
      >
        <input value={ownKeep} onChange={(event) => setOwnKeep(event.target.value)} aria-label="Add a keep" placeholder="Add your own" />
        <button className="btn btn-outline" type="submit">
          {copy.addOwn}
        </button>
      </form>

      <h2 style={{ marginTop: 18 }}>Replace</h2>
      <p className="meta">{copy.replaceOptional}</p>
      <div className="chips" style={{ marginTop: 8 }}>
        {[...new Set([...suggestions.replace, ...replace])].map((item) => (
          <button key={item} type="button" className="choice" aria-pressed={replace.includes(item)} onClick={() => toggle(replace, item, "replace")}>
            {item}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          const text = ownReplace.trim();
          if (!text) return;
          const next = [...replace, text];
          setReplace(next);
          setOwnReplace("");
          persist({ replace: next });
        }}
      >
        <input value={ownReplace} onChange={(event) => setOwnReplace(event.target.value)} aria-label="Add a replace" placeholder="Add your own" />
        <button className="btn btn-outline" type="submit">
          {copy.addOwn}
        </button>
      </form>

      {style && budget && state.links.some((item) => item.planId === plan.id && item.zoneId !== zoneId) ? (
        <button
          id="use-style"
          className="choice"
          type="button"
          style={{ width: "100%", marginTop: 16 }}
          onClick={() => {
            persist();
            dispatch({ type: "apply-style", planId: plan.id, zoneId });
            setUsed(copy.usedStyle);
          }}
        >
          {copy.useStyle}
        </button>
      ) : null}
      {used ? <p className="meta">{used}</p> : null}

      {hasBefore ? (
        <div className="thumb-paths">
          <button className="btn btn-outline btn-wide" type="button" disabled={reading} onClick={() => afterRef.current?.click()}>
            {reading ? copy.reading : copy.uploadAfter}
          </button>
          <p className="meta">{copy.sameSpot}</p>
          <button
            className="btn btn-primary btn-wide"
            type="button"
            disabled={!ready || busyZoneId === zoneId || capReached(currentLink.attempts)}
            onClick={() => void onGenerate()}
          >
            {making ? copy.making : copy.generate}
          </button>
          {left === 0 ? <p className="meta">{copy.triesLeft(left)}</p> : null}
          <input
            ref={afterRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              void onUploadAfter(event.target.files);
              event.target.value = "";
            }}
          />
          {!ready ? <p className="meta">{copy.pickStyle}</p> : null}
          {uploadError ? <p className="warn">{copy.uploadFailed}</p> : null}
          {currentLink.lastFailed ? <p className="warn">{copy.failure}</p> : null}
        </div>
      ) : null}
      {picker.picker}
    </div>
  );
}
