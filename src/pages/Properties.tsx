import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { TopBar } from "../components/Chrome";
import { statusLabel } from "../lib/status";
import { useRenovate } from "../state/store";

export default function Properties() {
  const navigate = useNavigate();
  const { state, propertyLoad, reloadProperties, dispatch } = useRenovate();
  const [query, setQuery] = useState("");
  const properties = state.properties;
  const showSearch = properties.length > 5;
  const visible = properties.filter((property) => {
    const hay = `${property.name} ${property.suburb}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className={`page ${properties.length === 0 && propertyLoad === "ready" ? "has-action" : ""}`}>
      <TopBar title={copy.yourProperties} />
      {propertyLoad === "loading" ? <p>{copy.propertiesLoading}</p> : null}
      {propertyLoad === "error" ? (
        <>
          <p className="warn">{copy.propertiesFailed}</p>
          <button className="btn btn-primary" type="button" onClick={reloadProperties}>
            {copy.tryLoad}
          </button>
        </>
      ) : null}
      {propertyLoad === "ready" && properties.length === 0 ? (
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
      {showSearch && query.trim() && visible.length === 0 ? <p>{copy.noMatch}</p> : null}
      <div className="stack" style={{ marginTop: 12 }}>
        {visible.map((property) => {
          const plans = state.plans.filter((plan) => plan.propertyId === property.id);
          const open = plans.find((plan) => plan.id === state.activePlanId) ?? plans[0];
          const cover = state.photos.find((photo) => photo.id === property.coverPhotoId)?.url;
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
