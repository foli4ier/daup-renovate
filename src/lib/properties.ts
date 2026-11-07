export type DaupProperty = {
  id: string;
  name: string;
  suburb: string;
  ownerId: string;
  /** Property’s own place id. Not the Hub place id. */
  placeId?: string;
  /** Hub place id stored on the unit. */
  externalPlaceId?: string;
  /** Hub house name stored on the unit. */
  placeName?: string;
};

export const PROPERTY_LIST_URL = "https://property.daup.co.za/api/properties";

export type PropertyPrefer = {
  houseHint: string;
  placeIdHints: string[];
};

export const PROPERTY_HOME = "https://property.daup.co.za";

export function hinted(prefer: PropertyPrefer | undefined): boolean {
  if (!prefer) return false;
  return Boolean(prefer.houseHint.trim() || prefer.placeIdHints.some((id) => id.trim()));
}

type Matchable = {
  id: string;
  name: string;
  externalPlaceId?: string;
  placeName?: string;
};

/**
 * Hub place id against id or externalPlaceId, then house name against name or placeName.
 * The first hit wins. A hint that misses is not turned into a property.
 */
export function matchProperty<T extends Matchable>(properties: T[], prefer: PropertyPrefer | undefined): T | undefined {
  if (!prefer) return undefined;
  const ids = new Set(prefer.placeIdHints.map((id) => id.trim()).filter(Boolean));
  if (ids.size) {
    const byId = properties.find((property) => ids.has(property.id) || ids.has((property.externalPlaceId || "").trim()));
    if (byId) return byId;
  }
  const house = prefer.houseHint.trim().toLowerCase();
  if (!house) return undefined;
  return properties.find((property) => {
    const name = property.name.trim().toLowerCase();
    const placeName = (property.placeName || "").trim().toLowerCase();
    return name === house || placeName === house;
  });
}

export function pickPropertyId(
  properties: { id: string; name: string }[],
  prefer: PropertyPrefer | undefined,
  current: string,
): string {
  const matched = matchProperty(properties, prefer);
  if (matched) return matched.id;
  // A Hub hint that missed is not a reason to open some other house.
  if (hinted(prefer)) return "";
  if (properties.some((property) => property.id === current)) return current;
  return properties[0]?.id ?? "";
}

/** Name to show when the Hub house is not among the loaded Property records. */
export function unmatchedHouseName(
  properties: { id: string; name: string }[],
  prefer: PropertyPrefer | undefined,
): string {
  if (!hinted(prefer) || !prefer) return "";
  if (matchProperty(properties, prefer)) return "";
  return prefer.houseHint.trim() || "that house";
}

function optionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeProperty(value: unknown): DaupProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || !name) return null;
  const suburb = typeof record.suburb === "string" ? record.suburb.trim() : "";
  const ownerId = typeof record.ownerId === "string" ? record.ownerId.trim() : "";
  const property: DaupProperty = { id, name, suburb, ownerId };
  const placeId = optionalId(record.placeId);
  const externalPlaceId = optionalId(record.externalPlaceId);
  const placeName = optionalId(record.placeName);
  if (placeId) property.placeId = placeId;
  if (externalPlaceId) property.externalPlaceId = externalPlaceId;
  if (placeName) property.placeName = placeName;
  return property;
}

/** `{ properties: [...] }` from DAUP Property. A bare array is accepted. Unknown fields are ignored. */
export function readPropertyList(data: unknown): DaupProperty[] | null {
  let list: unknown[] | null = null;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (!Array.isArray(record.properties)) return null;
    list = record.properties;
  }
  if (!list) return null;
  const properties: DaupProperty[] = [];
  for (const item of list) {
    const property = normalizeProperty(item);
    if (!property) return null;
    properties.push(property);
  }
  return properties;
}
