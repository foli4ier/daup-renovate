import { copy } from "../copy";
import { PROPERTY_HOME } from "../lib/properties";

export function OpenProperty() {
  return (
    <a className="btn btn-primary btn-wide" href={PROPERTY_HOME}>
      {copy.openProperty}
    </a>
  );
}

export function PropertyCards({
  properties,
  onChoose,
}: {
  properties: { id: string; name: string; suburb: string }[];
  onChoose: (id: string) => void;
}) {
  if (!properties.length) return null;
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {properties.map((property) => (
        <button key={property.id} className="property-card" type="button" onClick={() => onChoose(property.id)}>
          <span className="ph">Photo</span>
          <span>
            <strong>{property.name}</strong>
            {property.suburb ? (
              <span className="meta" style={{ display: "block" }}>
                {property.suburb}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
