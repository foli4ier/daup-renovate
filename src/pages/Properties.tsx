import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { samplePropertySource, type DaupProperty } from "../api/property";
import { copy } from "../copy";
import { TopBar } from "../components/Chrome";
import { statusLabel } from "../lib/status";
import { useRenovate } from "../state/store";

export default function Properties() {
  const navigate = useNavigate();
  const { state, dispatch } = useRenovate();
  const [listed, setListed] = useState<DaupProperty[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void samplePropertySource.listProperties().then(setListed);
  }, []);

  const properties = listed ?? [];
  const showSearch = properties.length > 5;
  const visible = properties.filter((property) => {
    const hay = `${property.name} ${property.suburb}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className={`page ${properties.length === 0 ? "has-action" : ""}`}>
      <TopBar title={copy.yourProperties} />
      {properties.length === 0 && listed ? (
        <>
          <p>{copy.emptyProperties}</p>
          <div className="action-bar">
            <a className="btn btn-primary btn-wide" href="https://apps.daup.co.za">
              {copy.openProperty}
            </a>
          </div>
        </>
      ) : null}
      {showSearch ? (
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search properties"
          placeholder="Search"
        />
      ) : null}
      <div className="stack" style={{ marginTop: 12 }}>
        {visible.map((property) => {
          const local = state.properties.find((item) => item.id === property.id);
          const plans = state.plans.filter((plan) => plan.propertyId === property.id);
          const open = plans.find((plan) => plan.id === state.activePlanId) ?? plans[0];
          const cover = local ? state.photos.find((photo) => photo.id === local.coverPhotoId)?.url : undefined;
          const status = open ? `${statusLabel(open.status)} plan` : "No plan yet";
          return (
            <button
              key={property.id}
              className="property-card"
              type="button"
              onClick={() => {
                dispatch({ type: "select-property", propertyId: property.id });
                navigate(open ? "/plan" : "/");
              }}
            >
              {cover ? <img src={cover} alt="" /> : <span className="ph">Photo</span>}
              <span>
                <strong>{property.name}</strong>
                {property.suburb ? <span className="meta" style={{ display: "block" }}>{property.suburb}</span> : null}
                <span className="meta" style={{ display: "block" }}>{status}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
