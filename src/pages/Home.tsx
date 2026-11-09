import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { OpenProperty, PropertyCards } from "../components/PropertyStatus";
import { Sheet, StepRail, Wordmark } from "../components/Chrome";
import { SpendPhases } from "../components/SpendPhases";
import { statusLabel } from "../lib/status";
import { activePlan, activeProperty, approvedCount, continuePath, coverUrl, zonePill } from "../state/select";
import { useRenovate } from "../state/store";

export default function Home() {
  const navigate = useNavigate();
  const { state, propertyLoad, unmatchedHouse, reloadProperties, chooseProperty, startPlan, dispatch } = useRenovate();
  const selected = state.properties.find((item) => item.id === state.activePropertyId);
  const property = state.sample || !unmatchedHouse ? activeProperty(state) : selected;
  const plan = activePlan(state);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const others = property ? state.plans.filter((item) => item.propertyId === property.id && item.id !== plan?.id) : [];
  const lastZone = plan?.lastZoneId
    ? state.zones.find((zone) => zone.id === plan.lastZoneId && zone.propertyId === property?.id)
    : undefined;

  if (!state.sample && propertyLoad === "loading") {
    return (
      <div className="page">
        <Wordmark />
        <p>{copy.propertiesLoading}</p>
      </div>
    );
  }

  if (!state.sample && propertyLoad === "error") {
    return (
      <div className="page has-action">
        <Wordmark />
        <p className="warn">{copy.propertiesFailed}</p>
        <div className="action-bar">
          <button className="btn btn-primary btn-wide" type="button" onClick={reloadProperties}>
            {copy.tryLoad}
          </button>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="page has-action">
        <Wordmark />
        <h1>Your properties</h1>
        <p>{unmatchedHouse ? copy.missingHouse(unmatchedHouse) : copy.emptyProperties}</p>
        <PropertyCards properties={state.properties} onChoose={chooseProperty} />
        <div className="action-bar">
          <OpenProperty />
        </div>
      </div>
    );
  }

  const cover = coverUrl(state, property);
  const counts = plan ? approvedCount(state, plan) : null;

  return (
    <div className="page">
      <Wordmark />
      <button className="property-jump" type="button" onClick={() => navigate("/properties")}>
        <h1>{property.name}</h1>
        {property.suburb ? <p className="meta">{property.suburb}</p> : null}
      </button>
      {cover ? (
        <div className="hero">
          <img src={cover} alt={state.sample ? "Sample drawing of the house before" : ""} />
        </div>
      ) : null}
      {state.sample ? <p className="sample-tag">{copy.sampleMark}</p> : null}

      {plan && counts ? (
        <section className="card home-card">
          <p className="kicker">{copy.continuePlan}</p>
          <h2>{plan.name}</h2>
          <p>{copy.progress(counts.approved, counts.total)}</p>
          <div className="meter" role="img" aria-label={copy.progress(counts.approved, counts.total)}>
            <span style={{ width: `${counts.total ? (counts.approved / counts.total) * 100 : 0}%` }} />
          </div>
          {lastZone ? <p>{copy.wereOn(lastZone.name)}</p> : null}
          <StepRail pill={lastZone ? zonePill(state, plan.id, lastZone) : "needs-photos"} />
          <button className="btn btn-primary btn-wide" type="button" onClick={() => navigate(continuePath(state))} style={{ marginTop: 8 }}>
            {copy.continue}
          </button>
          {plan.status === "in-project" && plan.projectUrl ? (
            <a className="text-btn" href={plan.projectUrl} target="_blank" rel="noopener noreferrer">
              {copy.openProject}
            </a>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <p>{copy.emptyPlan(property.name)}</p>
          <button
            className="btn btn-primary btn-wide"
            type="button"
            onClick={() => {
              setName(`${property.name} refresh`);
              setNaming(true);
            }}
          >
            {copy.startPlan}
          </button>
        </section>
      )}

      {plan ? <SpendPhases /> : null}

      {plan ? (
        <button
          className="text-btn"
          type="button"
          onClick={() => {
            setName(`${property.name} refresh`);
            setNaming(true);
          }}
        >
          {copy.startPlan}
        </button>
      ) : null}

      {others.length ? (
        <div className="stack" style={{ marginTop: 8 }}>
          {others.map((item) => (
            <button
              key={item.id}
              className="plan-card"
              type="button"
              onClick={() => {
                dispatch({ type: "select-plan", planId: item.id });
                navigate("/plan");
              }}
            >
              <strong>{item.name}</strong>
              <span className="meta" style={{ display: "block" }}>
                {statusLabel(item.status)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {naming ? (
        <Sheet
          title={copy.startPlan}
          onClose={() => setNaming(false)}
          footer={
            <button
              className="btn btn-primary btn-wide"
              type="button"
              onClick={() => {
                startPlan(name);
                setNaming(false);
                navigate("/plan");
              }}
            >
              {copy.startPlan}
            </button>
          }
        >
          <label className="field">
            {copy.namePlan}
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </Sheet>
      ) : null}
    </div>
  );
}
