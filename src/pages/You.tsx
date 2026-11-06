import { Link } from "react-router-dom";
import { copy } from "../copy";
import { Wordmark } from "../components/Chrome";

export default function You() {
  return (
    <div className="page has-action">
      <Wordmark />
      <h1>You</h1>
      <p>{copy.youOnly}</p>
      <p className="meta">{copy.budgetsStay}</p>
      <Link className="text-btn" to="/budget">
        {copy.seeEstimate}
      </Link>
      <div className="action-bar">
        <a className="btn btn-primary btn-wide" href="https://apps.daup.co.za">
          {copy.openHub}
        </a>
      </div>
    </div>
  );
}
