import { loggableHandoff } from "../lib/secrets";
import { normalizeProperty, type DaupProperty } from "../lib/properties";

export type { DaupProperty };

export type PropertyQuery = {
  houseRedeem?: string;
  emailHint?: string;
  houseHint?: string;
  placeIdHints?: string[];
  mock?: "" | "house" | "empty" | "fail";
};

export type PropertyClientResult =
  | { ok: true; properties: DaupProperty[] }
  | { ok: false; code: "unreachable" | "redeem"; spent?: boolean };

/** Read-only. Renovate never creates properties. */
export interface PropertySource {
  load(query: PropertyQuery, log?: (line: string) => void): Promise<PropertyClientResult>;
}

const flights = new Map<string, Promise<PropertyClientResult>>();

function normalizeList(value: unknown): DaupProperty[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || !Array.isArray(record.properties)) return null;
  const properties: DaupProperty[] = [];
  for (const item of record.properties) {
    const property = normalizeProperty(item);
    if (!property) return null;
    properties.push(property);
  }
  return properties;
}

export async function requestProperties(query: PropertyQuery, log?: (line: string) => void): Promise<PropertyClientResult> {
  log?.(
    loggableHandoff({
      emailHint: query.emailHint,
      houseHint: query.houseHint,
      placeIdHints: query.placeIdHints,
      houseRedeem: query.houseRedeem,
    }),
  );
  let response: Response;
  try {
    response = await fetch("/api/properties", {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        houseRedeem: query.houseRedeem || "",
        emailHint: query.emailHint || "",
        houseHint: query.houseHint || "",
        placeIdHints: query.placeIdHints || [],
        mock: query.mock || "",
      }),
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (!response.ok) return { ok: false, code: "unreachable" };
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, code: "unreachable" };
  }
  const properties = normalizeList(data);
  if (properties) return { ok: true, properties };
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as { code?: string; spent?: boolean };
    if (record.code === "redeem" || record.code === "unreachable") {
      return { ok: false, code: record.code, spent: record.spent === true };
    }
  }
  return { ok: false, code: "unreachable" };
}

export function loadProperties(query: PropertyQuery, key: string, log?: (line: string) => void): Promise<PropertyClientResult> {
  const existing = flights.get(key);
  if (existing) return existing;
  const pending = requestProperties(query, log).finally(() => {
    flights.delete(key);
  });
  flights.set(key, pending);
  return pending;
}

export const propertySource: PropertySource = {
  load(query, log) {
    return requestProperties(query, log);
  },
};
