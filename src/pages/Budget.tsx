import { useState } from "react";
import { Link } from "react-router-dom";
import { copy } from "../copy";
import { tierLabel } from "../data/guides";
import { ActionBar, TopBar } from "../components/Chrome";
import { formatRand, formatRange } from "../lib/money";
import { rateGuide, tierTotal, type MoneyLine } from "../lib/budget";
import type { Tier } from "../lib/prompt";
import { activePlan, budgetLines, budgetTotal, proposalsFor } from "../state/select";
import { useRenovate } from "../state/store";

function Line({ line, tier }: { line: MoneyLine; tier: Tier }) {
  if (line.quoteOnly) {
    return (
      <p>
        {line.label} · {copy.quoteOnly}
      </p>
    );
  }
  if (line.needsSize && line.low !== undefined && line.high !== undefined) {
    return (
      <div>
        <p>
          {line.label} · {formatRange(line.low, line.high)} {line.per}
        </p>
        <p>
          <Link to="/plan?edit=1">{copy.addSize}</Link>
        </p>
      </div>
    );
  }
  const amount = tier === "low" ? line.low : tier === "mid" ? line.mid : line.high;
  const guide = rateGuide(line);
  return (
    <div>
      <p>
        {line.label} · {amount !== undefined ? formatRand(amount) : ""}
      </p>
      {guide ? (
        <p className="meta">
          {formatRange(guide.low, guide.high)} per m²
        </p>
      ) : line.low !== undefined && line.high !== undefined ? (
        <p className="meta">{formatRange(line.low, line.high)}</p>
      ) : null}
    </div>
  );
}

export default function Budget() {
  const { state } = useRenovate();
  const plan = activePlan(state);
  const [tier, setTier] = useState<Tier>("mid");
  if (!plan) {
    return (
      <div className="page">
        <TopBar />
        <p>{copy.startPlan}</p>
      </div>
    );
  }
  const groups = budgetLines(state, plan);
  const total = budgetTotal(groups);
  const mid = tierTotal(
    groups.flatMap((group) => group.lines),
    tier,
  );

  return (
    <div className={`page ${groups.length ? "has-action" : ""}`}>
      <TopBar title="Estimate" />
      <p className="banner">{copy.bannerEstimate}</p>
      {groups.length === 0 ? (
        <p style={{ marginTop: 16 }}>{copy.approveFirst}</p>
      ) : (
        <>
          <p className="total">{total ? formatRange(total.low, total.high) : copy.addSize}</p>
          <div className="tier-row" role="group" aria-label="Low, mid, or high">
            {(["low", "mid", "high"] as const).map((item) => (
              <button key={item} type="button" className="tier" aria-pressed={tier === item} onClick={() => setTier(item)}>
                {tierLabel(item)}
              </button>
            ))}
          </div>
          {mid !== null ? (
            <p className="meta">
              {tierLabel(tier)} total {formatRand(mid)}
            </p>
          ) : null}
          <div className="stack" style={{ marginTop: 16 }}>
            {groups.map((group) => {
              const link = state.links.find((item) => item.planId === plan.id && item.zoneId === group.zone.id);
              const picture = proposalsFor(state, plan.id, group.zone.id).find((item) => item.id === link?.approvedProposalId);
              return (
                <article key={group.zone.id} className="card">
                  <div className="budget-zone">
                    {picture ? <img src={picture.imageUrl} alt="" /> : <span className="ph">Photo</span>}
                    <div>
                      <h3>{group.zone.name}</h3>
                      {group.lines.map((line) => (
                        <Line key={line.id} line={line} tier={tier} />
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {groups.length ? (
        <ActionBar>
          <Link className="btn btn-primary btn-wide" to="/work">
            {copy.seePlan}
          </Link>
        </ActionBar>
      ) : null}
    </div>
  );
}
