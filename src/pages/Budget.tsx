import { useState } from "react";
import { Link } from "react-router-dom";
import { copy } from "../copy";
import { tierLabel } from "../data/guides";
import { ActionBar, Wordmark } from "../components/Chrome";
import { formatRand, formatRange } from "../lib/money";
import { rateGuide, tierTotal, type MoneyLine } from "../lib/budget";
import type { Tier } from "../lib/prompt";
import { activePlan, budgetLines, budgetReport, proposalsFor } from "../state/select";
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
          <Link className="text-btn" to="/plan?edit=1">{copy.addSize}</Link>
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
        <Wordmark />
        <h1>Estimate</h1>
        <p>{copy.startPlan}</p>
      </div>
    );
  }
  const groups = budgetLines(state, plan);
  const report = budgetReport(groups);
  const mid = report.ready
    ? tierTotal(
        groups.flatMap((group) => group.lines),
        tier,
      )
    : null;

  return (
    <div className="page has-action">
      <Wordmark />
      <h1>Estimate</h1>
      <p className="banner">{copy.bannerEstimate}</p>
      <p>{copy.youOnly}</p>
      <p className="meta">{copy.budgetsStay}</p>
      {groups.length === 0 ? (
        <>
          <p style={{ marginTop: 16 }}>{copy.approveFirst}</p>
          <div className="action-bar">
            <Link className="btn btn-primary btn-wide" to="/plan">
              {copy.toZones}
            </Link>
          </div>
        </>
      ) : (
        <>
          {report.ready ? (
            <p className="total">{formatRange(report.low, report.high)}</p>
          ) : (
            <>
              <p className="meta" style={{ marginTop: 12 }}>{copy.sizeFirst}</p>
              <Link className="text-btn" to="/plan?edit=1">{copy.addSize}</Link>
            </>
          )}
          {report.quoteOnly > 0 ? <p className="meta">{copy.quoteOutside}</p> : null}
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
