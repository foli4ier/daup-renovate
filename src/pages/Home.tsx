import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { PushSheet } from "../components/ProjectSheets";
import { Wordmark } from "../components/Chrome";
import { Sheet } from "../components/Chrome";
import { statusLabel } from "../lib/status";
import { stepHref } from "../state/select";
import { activePlan, activeProperty, approvedCount, coverUrl, planNext } from "../state/select";
import { useRenovate } from "../state/store";
import type { NextStep } from "../lib/status";

export default function Home() {
  const navigate = useNavigate();
  const { state, propertyLoad, reloadProperties, startPlan, dispatch } = useRenovate();
  const property = activeProperty(state);
  const plan = activePlan(state);
  const next = planNext(state);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [push, setPush] = useState(false);
  const others = property ? state.plans.filter((item) => item.propertyId === property.id && item.id !== plan?.id) : [];

  function follow(step: NextStep) {
    if (step.kind === "start") {
      setName(property ? `${property.name} refresh` : "");
      setNaming(true);
      return;
    }
    if (step.kind === "push") {
      setPush(true);
      return;
    }
    if (step.kind === "project" && plan?.projectUrl) {
      window.open(plan.projectUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const href = stepHref(step);
    if (href) navigate(href);
  }

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
        <p>{copy.emptyProperties}</p>
        <div className="action-bar">
          <a className="btn btn-primary btn-wide" href="https://apps.daup.co.za">
            {copy.openProperty}
          </a>
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
          <p>{copy.zoneScore(counts.total, counts.approved)}</p>
          <div className="meter" role="img" aria-label={copy.zoneScore(counts.total, counts.approved)}>
            <span style={{ width: `${counts.total ? (counts.approved / counts.total) * 100 : 0}%` }} />
          </div>
          <p>Next: {next.label}</p>
          <button className="btn btn-primary btn-wide" type="button" onClick={() => follow(next)} style={{ marginTop: 8 }}>
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
      {push ? <PushSheet onClose={() => setPush(false)} /> : null}
    </div>
  );
}
