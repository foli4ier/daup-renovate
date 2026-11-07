import { copy } from "../copy";
import type { ZoneKind } from "../state/types";

export function AddZoneFields({
  name,
  kind,
  onName,
  onKind,
}: {
  name: string;
  kind?: ZoneKind;
  onName: (name: string) => void;
  onKind: (kind: ZoneKind | undefined) => void;
}) {
  return (
    <div>
      <label className="field">
        Name
        <input value={name} placeholder={copy.placeholderName} onChange={(event) => onName(event.target.value)} />
      </label>
      <div className="chips" role="group" aria-label="Inside or outside">
        {(["outside", "inside"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className="choice"
            aria-pressed={kind === item}
            onClick={() => onKind(kind === item ? undefined : item)}
          >
            {item === "outside" ? "Outside." : "Inside."}
          </button>
        ))}
      </div>
    </div>
  );
}
