import { Link } from "react-router-dom";
import { copy } from "../copy";
import { Wordmark } from "../components/Chrome";
import { useRenovate } from "../state/store";

export default function You() {
  const { reset } = useRenovate();
  return (
    <div className="page has-action">
      <Wordmark />
      <h1>You</h1>
      <p>{copy.youOnly}</p>
      <p className="meta">{copy.budgetsStay}</p>
      <Link className="text-btn" to="/budget">
        {copy.seeEstimate}
      </Link>
      <button className="text-btn" type="button" onClick={reset}>
        {copy.loadSample}
      </button>
      <div className="action-bar">
        <a className="btn btn-primary btn-wide" href="https://apps.daup.co.za">
          {copy.openHub}
        </a>
      </div>
    </div>
  );
}
