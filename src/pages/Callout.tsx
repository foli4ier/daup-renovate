import { useState } from "react";
import { Link } from "react-router-dom";
import { copy } from "../copy";
import { TopBar } from "../components/Chrome";
import { findLeak, leakPhrase, locateLeak } from "../lib/leak";
import { activePlan, approvedVisible, proposalsFor, scopeFor } from "../state/select";
import { useRenovate } from "../state/store";

export default function Callout() {
  const { state, sendCallouts } = useRenovate();
  const plan = activePlan(state);
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"choose" | "preview">("choose");
  const [hint, setHint] = useState("");
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!plan) {
    return (
      <div className="page">
        <TopBar />
        <p>{copy.startPlan}</p>
      </div>
    );
  }

  const zones = approvedVisible(state, plan);
  const already = new Set(state.requests.filter((request) => request.planId === plan.id).map((request) => request.zoneId));

  if (!zones.length) {
    return (
      <div className="page">
        <TopBar title="CallOut" />
        <p>{copy.approveFirst}</p>
      </div>
    );
  }

  const chosen = zones.filter((zone) => picked.includes(zone.id));

  return (
    <div className="page has-action">
      <TopBar title="CallOut" />
      {step === "choose" ? (
        <>
          <h1>Choose zones</h1>
          <div className="stack" style={{ marginTop: 12 }}>
            {zones.map((zone) => {
              const link = state.links.find((item) => item.planId === plan.id && item.zoneId === zone.id);
              const picture = proposalsFor(state, plan.id, zone.id).find((item) => item.id === link?.approvedProposalId);
              const on = picked.includes(zone.id);
              const done = already.has(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  className="check"
                  aria-pressed={on}
                  disabled={done}
                  onClick={() => setPicked((current) => (current.includes(zone.id) ? current.filter((id) => id !== zone.id) : [...current, zone.id]))}
                >
                  <span className="box">{on ? "✓" : ""}</span>
                  {picture ? <img src={picture.imageUrl} alt="" /> : null}
                  <span>
                    <strong>{zone.name}</strong>
                    {done ? <span className="meta" style={{ display: "block" }}>{copy.sent}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          {hint ? <p className="meta">{hint}</p> : null}
          <div className="action-bar">
            <button
              className="btn btn-primary btn-wide"
              type="button"
              onClick={() => {
                if (!picked.length) {
                  setHint(copy.pickZone);
                  return;
                }
                setHint("");
                setStep("preview");
              }}
            >
              {copy.preview}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="banner">{copy.bannerCallout}</p>
          <p className="meta" style={{ marginTop: 8 }}>{copy.oneEach}</p>
          <div className="stack" style={{ marginTop: 12 }}>
            {chosen.map((zone) => {
              const link = state.links.find((item) => item.planId === plan.id && item.zoneId === zone.id);
              const picture = proposalsFor(state, plan.id, zone.id).find((item) => item.id === link?.approvedProposalId);
              const before = picture ? state.photos.find((photo) => photo.id === picture.beforePhotoId) : undefined;
              const scope = scopeFor(state, plan, zone);
              const spot = link
                ? locateLeak({
                    keep: link.keep,
                    replace: link.replace,
                    answers: zone.answers.map((answer) => answer.text),
                    styleNote: link.styleNote,
                  })
                : null;
              return (
                <article key={zone.id} className="card">
                  <h3>{zone.name}</h3>
                  {spot ? (
                    <>
                      <p className="warn">{leakPhrase(spot)}</p>
                      <p className="meta">Change it, then preview again.</p>
                      <Link className="text-btn" to={`/zone/${zone.id}`}>
                        Change {zone.name}.
                      </Link>
                    </>
                  ) : (
                    <p>{scope}</p>
                  )}
                  <div className="pair" style={{ marginTop: 10 }}>
                    {before ? (
                      <figure>
                        <img src={before.url} alt="Before" />
                        <figcaption>Before</figcaption>
                      </figure>
                    ) : null}
                    {picture ? (
                      <figure>
                        <img src={picture.imageUrl} alt="After" />
                        <figcaption>After</figcaption>
                      </figure>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="meta">{copy.workshop}</p>
          {failed ? <p className="warn">{copy.nothingSent}</p> : null}
          {sent ? <p className="banner" style={{ marginTop: 12 }}>{copy.sent}</p> : null}
          <div className="action-bar">
            <button
              className="btn btn-primary btn-wide"
              type="button"
              disabled={sent || chosen.some((zone) => findLeak(scopeFor(state, plan, zone)) !== null)}
              onClick={() => {
                setFailed(false);
                void sendCallouts(chosen.map((zone) => zone.id)).then((result) => {
                  if (result.blocked) {
                    setSent(false);
                    return;
                  }
                  if (result.ok) {
                    setSent(true);
                    return;
                  }
                  setFailed(true);
                });
              }}
            >
              {copy.send}
            </button>
            <button className="text-btn" type="button" onClick={() => setStep("choose")}>
              {copy.back}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
