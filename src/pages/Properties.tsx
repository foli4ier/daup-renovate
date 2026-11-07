import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { TopBar } from "../components/Chrome";
import { OpenProperty } from "../components/PropertyStatus";
import { statusLabel } from "../lib/status";
import { useRenovate } from "../state/store";

export default function Properties() {
  const navigate = useNavigate();
  const { state, propertyLoad, unmatchedHouse, reloadProperties, chooseProperty } = useRenovate();
  const [query, setQuery] = useState("");
  const properties = state.properties;
  const showSearch = propertyLoad === "ready" && properties.length > 5;
  const visible = properties.filter((property) => {
    const hay = `${property.name} ${property.suburb}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const searching = showSearch && query.trim().length > 0;
  const showOpen = propertyLoad === "ready" && (properties.length === 0 || Boolean(unmatchedHouse)) && !(searching && visible.length === 0);

  return (
    <div className={`page ${propertyLoad === "error" || showOpen ? "has-action" : ""}`}>
      <TopBar title={copy.yourProperties} />
      {propertyLoad === "loading" ? <p>{copy.propertiesLoading}</p> : null}
      {propertyLoad === "error" ? (
        <>
          <p className="warn">{copy.propertiesFailed}</p>
          <div className="action-bar">
            <button className="btn btn-primary btn-wide" type="button" onClick={reloadProperties}>
              {copy.tryLoad}
            </button>
          </div>
        </>
      ) : null}
      {propertyLoad === "ready" && properties.length === 0 ? (
        <p>{unmatchedHouse ? copy.missingHouse(unmatchedHouse) : copy.emptyProperties}</p>
      ) : null}
      {propertyLoad === "ready" && unmatchedHouse && properties.length > 0 ? <p>{copy.missingHouse(unmatchedHouse)}</p> : null}
      {showOpen ? (
        <div className="action-bar">
          <OpenProperty />
        </div>
      ) : null}
      {propertyLoad === "ready" ? (
        <>
          {showSearch ? (
            <input
              className="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search properties"
              placeholder="Search"
            />
          ) : null}
          {showSearch && query.trim() && visible.length === 0 ? (
            <>
              <p>{copy.noMatch}</p>
              <button className="btn btn-primary" type="button" onClick={() => setQuery("")}>
                {copy.clearSearch}
              </button>
            </>
          ) : null}
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
                chooseProperty(property.id);
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
        </>
      ) : null}
    </div>
  );
}
