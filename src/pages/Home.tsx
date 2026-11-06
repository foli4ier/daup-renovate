import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { ProjectSheet, PushSheet } from "../components/ProjectSheets";
import { ActionBar, Wordmark } from "../components/Chrome";
import { statusLabel } from "../lib/status";
import { stepHref } from "../state/select";
import { activePlan, activeProperty, approvedCount, coverUrl, planNext } from "../state/select";
import { useRenovate } from "../state/store";
import { Sheet } from "../components/Chrome";

export default function Home() {
  const navigate = useNavigate();
  const { state, startPlan, dispatch } = useRenovate();
  const property = activeProperty(state);
  const plan = activePlan(state);
  const next = planNext(state);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState<"push" | "project" | null>(null);
  const others = property ? state.plans.filter((item) => item.propertyId === property.id && item.id !== plan?.id) : [];

  function follow() {
    if (next.kind === "start") {
      setName(property ? `${property.name} refresh` : "");
      setNaming(true);
      return;
    }
    if (next.kind === "push") {
      setSheet("push");
      return;
    }
    if (next.kind === "project") {
      setSheet("project");
      return;
    }
    const href = stepHref(next);
    if (href) navigate(href);
  }

  if (!property) {
    return (
      <div className="page">
        <Wordmark />
        <h1>Your properties</h1>
        <p>{copy.emptyProperties}</p>
        <ActionBar>
          <a className="btn btn-primary btn-wide" href="https://apps.daup.co.za">
            {copy.openProperty}
          </a>
        </ActionBar>
      </div>
    );
  }

  const cover = coverUrl(state, property);
  const counts = plan ? approvedCount(state, plan) : null;

  return (
    <div className={`page ${naming || sheet ? "" : "has-action"}`}>
      <Wordmark />
      {cover ? (
        <div className="hero">
          <img src={cover} alt="" />
        </div>
      ) : null}
      <button className="property-jump" type="button" onClick={() => navigate("/properties")}>
        <h1>{property.name}</h1>
        {property.suburb ? <p className="meta">{property.suburb}</p> : null}
      </button>

      {plan && counts ? (
        <section className="card">
          <p className="kicker">{copy.continuePlan}</p>
          <h2>{plan.name}</h2>
          <p className="meta">{copy.progress(counts.approved, counts.total)}</p>
          <p>Next: {next.label}</p>
          {plan.status === "in-project" ? (
            <button className="text-btn" type="button" onClick={() => setSheet("project")}>
              {copy.openProject}
            </button>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <p>{copy.emptyPlan(property.name)}</p>
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
        <div className="stack" style={{ marginTop: 16 }}>
          {others.map((item) => (
            <button
              key={item.id}
              className="property-card"
              type="button"
              onClick={() => {
                dispatch({ type: "select-plan", planId: item.id });
                navigate("/plan");
              }}
            >
              <span className="ph">Plan</span>
              <span>
                <strong>{item.name}</strong>
                <span className="meta" style={{ display: "block" }}>
                  {statusLabel(item.status)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {naming || sheet ? null : (
        <ActionBar>
          <button className="btn btn-primary btn-wide" type="button" onClick={follow}>
            {plan ? copy.continue : copy.startPlan}
          </button>
        </ActionBar>
      )}

      {naming ? (
        <Sheet title={copy.startPlan} onClose={() => setNaming(false)}>
          <label className="field">
            {copy.namePlan}
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
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
        </Sheet>
      ) : null}
      {sheet === "push" ? <PushSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "project" ? <ProjectSheet onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
