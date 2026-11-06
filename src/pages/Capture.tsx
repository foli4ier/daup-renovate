import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { copy } from "../copy";
import { SUGGESTIONS, STYLE_CHIPS, TIER_CHIPS } from "../data/guides";
import { unanswered } from "../data/questions";
import { ABOUT_ONE_MEGAPIXEL, type StyleId, type Tier } from "../lib/prompt";
import { ActionBar, TopBar } from "../components/Chrome";
import { activePlan, linkFor, photosFor } from "../state/select";
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
  const { state, dispatch, addPhoto, saveGuides, generate, busyZoneId } = useRenovate();
  const plan = activePlan(state);
  const zone = state.zones.find((item) => item.id === zoneId);
  const link = plan ? linkFor(state, plan.id, zoneId) : undefined;
  const photos = photosFor(state, zoneId);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<StyleId | undefined>(link?.style);
  const [styleNote, setStyleNote] = useState(link?.styleNote ?? "");
  const [budget, setBudget] = useState<Tier | undefined>(link?.budget);
  const [keep, setKeep] = useState<string[]>(link?.keep ?? []);
  const [replace, setReplace] = useState<string[]>(link?.replace ?? []);
  const [ownKeep, setOwnKeep] = useState("");
  const [ownReplace, setOwnReplace] = useState("");
  const [used, setUsed] = useState("");
  const [photoError, setPhotoError] = useState(false);
  const suggestions = SUGGESTIONS[zone?.key ?? ""] ?? { keep: [], replace: [] };

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

  function toggle(list: string[], value: string, kind: "keep" | "replace") {
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    if (kind === "keep") setKeep(next);
    else setReplace(next);
    persist(kind === "keep" ? { keep: next } : { replace: next });
  }

  async function onGenerate() {
    persist();
    const pending = unanswered(currentZone.key, currentZone.answers);
    if (pending.length && currentLink.proposalIds.length === 0) {
      dispatch({ type: "questions-pending", planId: currentPlan.id, zoneId, pending: true });
      navigate(`/zone/${zoneId}/questions`);
      return;
    }
    await generate(zoneId);
    navigate(`/gallery/${zoneId}`);
  }

  const ready = Boolean(style && (style !== "custom" || styleNote.trim()) && budget && photos.length);
  const small = photos.filter((photo) => photo.width * photo.height < ABOUT_ONE_MEGAPIXEL);

  return (
    <div className="page has-action">
      <TopBar title={zone.name} />
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
            <button className="text-btn" type="button" onClick={() => dispatch({ type: "remove-photo", photoId: photo.id })}>
              Remove.
            </button>
          </div>
        ))}
      </div>
      {photos.some((photo) => photo.starred) ? <p className="meta">{copy.mainPhoto}</p> : null}
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
      <p style={{ marginTop: 16 }}>{copy.tip}</p>
      <p className="meta">{copy.people}</p>

      <h2 style={{ marginTop: 22 }}>Style</h2>
      <div className="chips" style={{ marginTop: 8 }}>
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

      {style && budget && state.links.some((item) => item.planId === plan.id && item.zoneId !== zoneId && item.style && item.budget) ? (
        <button
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
      {!ready ? <p className="meta">{photos.length ? copy.pickStyle : copy.addPhotos(zone.name)}</p> : null}

      <ActionBar>
        <button className="btn btn-primary btn-wide" type="button" disabled={!ready || busyZoneId === zoneId} onClick={() => void onGenerate()}>
          {busyZoneId === zoneId ? copy.making : copy.generate}
        </button>
      </ActionBar>
    </div>
  );
}
