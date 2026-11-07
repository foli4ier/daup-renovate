import { isHouseRedeem } from "./secrets";

export const HANDOFF_EMAIL = "emailHint";
export const HANDOFF_HOUSE = "houseHint";
export const HANDOFF_PLACE = "placeIdHint";
export const HANDOFF_REDEEM = "houseRedeem";

export type HubHandoff = {
  emailHint: string;
  houseHint: string;
  placeIdHints: string[];
  /** Well-formed token only. Empty when the link had none. */
  houseRedeem: string;
};

export function emptyHandoff(): HubHandoff {
  return { emailHint: "", houseHint: "", placeIdHints: [], houseRedeem: "" };
}

/** Hints are not proof. `houseRedeem` is the one-time proof, and only when it matches the seed shape. */
export function readHubHandoff(params: URLSearchParams): HubHandoff {
  const emailHint = (params.get(HANDOFF_EMAIL) || "").trim().toLowerCase();
  const houseHint = (params.get(HANDOFF_HOUSE) || "").trim();
  const placeIdHints: string[] = [];
  for (const value of params.getAll(HANDOFF_PLACE)) {
    const id = value.trim();
    if (id && !placeIdHints.includes(id)) placeIdHints.push(id);
  }
  const rawRedeem = (params.get(HANDOFF_REDEEM) || "").trim();
  return {
    emailHint,
    houseHint,
    placeIdHints,
    houseRedeem: isHouseRedeem(rawRedeem) ? rawRedeem : "",
  };
}

export function handoffWasHinted(handoff: Pick<HubHandoff, "houseHint" | "placeIdHints">): boolean {
  return Boolean(handoff.houseHint.trim() || handoff.placeIdHints.some((id) => id.trim()));
}

type LocationLike = { search: string; pathname: string; hash: string };

/** Drop the token from the address bar. Hints stay so a reload can still preselect. */
export function captureHubHandoff(loc: LocationLike, replace: (url: string) => void): HubHandoff {
  const params = new URLSearchParams(loc.search);
  const handoff = readHubHandoff(params);
  const keys = [...params.keys()];
  if (keys.some((key) => key.toLowerCase() === HANDOFF_REDEEM.toLowerCase())) {
    for (const key of keys) {
      if (key.toLowerCase() === HANDOFF_REDEEM.toLowerCase()) params.delete(key);
    }
    const query = params.toString();
    replace(`${loc.pathname}${query ? `?${query}` : ""}${loc.hash}`);
  }
  return handoff;
}
