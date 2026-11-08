import { isHouseRedeem } from "./secrets";
import { readPropertyList, type DaupProperty, type PropertyPrefer } from "./properties";

export const DEFAULT_SEED_ORIGIN = "https://mcp.daup.co.za";
export const HOUSE_COOKIE = "daup_renovate_house";

const BEARER_ALIASES = ["placeSession", "session", "daup_house_session", "derivedToken"] as const;
const FORBIDDEN = new Set(["token", "pepper", "role", "roles"]);

export type PropertyMock = "" | "house" | "empty" | "fail";

export type PropertyLoadInput = {
  houseRedeem?: string;
  emailHint?: string;
  houseHint?: string;
  placeIdHints?: string[];
  bearer?: string;
  seedOrigin: string;
  propertyUrl: string;
  /** Dev server only. The production worker passes false. */
  allowMock?: boolean;
  mock?: PropertyMock;
  /** PROPERTY_MOCK=1. Still requires allowMock. */
  envMock?: boolean;
  fetchImpl?: typeof fetch;
};

export type PropertyLoadSuccess = {
  ok: true;
  properties: DaupProperty[];
  /** Place-session bearer for the httpOnly cookie. Never send this to the page. */
  sessionBearer?: string;
};

export type PropertyLoadFailure = {
  ok: false;
  code: "unreachable" | "redeem";
  /** The seed accepted the token, so a retry must not send it again. */
  spent?: boolean;
  sessionBearer?: string;
};

export type PropertyLoadOutcome = PropertyLoadSuccess | PropertyLoadFailure;

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function preferOf(input: PropertyLoadInput): PropertyPrefer {
  return {
    houseHint: (input.houseHint || "").trim(),
    placeIdHints: input.placeIdHints || [],
  };
}

function mockProperties(input: PropertyLoadInput): DaupProperty[] {
  const prefer = preferOf(input);
  const id = prefer.placeIdHints.map((item) => item.trim()).find(Boolean) || "prop_mock";
  const name = prefer.houseHint.trim() || "House";
  return [
    {
      id,
      name,
      suburb: "",
      ownerId: (input.emailHint || "").trim().toLowerCase(),
    },
  ];
}

function resolveMock(input: PropertyLoadInput): PropertyMock {
  if (!input.allowMock) return "";
  if (input.mock === "fail" || input.mock === "empty" || input.mock === "house") return input.mock;
  if (input.envMock) {
    const prefer = preferOf(input);
    if (prefer.houseHint || prefer.placeIdHints.some((id) => id.trim())) return "house";
    return "empty";
  }
  return "";
}

function readBearer(body: Record<string, unknown>): string {
  for (const alias of BEARER_ALIASES) {
    const value = body[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const session = body.session;
  if (isRecord(session)) {
    for (const alias of BEARER_ALIASES) {
      const value = session[alias];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

export function hasForbiddenKey(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => FORBIDDEN.has(key.toLowerCase()));
}

function tainted(body: Record<string, unknown>): boolean {
  return hasForbiddenKey(body);
}

async function redeemHouse(origin: string, houseRedeem: string, fetchImpl: FetchLike): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(`${origin.replace(/\/+$/, "")}/house/session/redeem`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ houseRedeem }),
    });
  } catch {
    return null;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (!isRecord(body) || tainted(body)) return null;
  if (response.status !== 200 || body.ok !== true) return null;
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
  const bearer = readBearer(body);
  if (!placeId || !bearer) return null;
  if (bearer === houseRedeem || isHouseRedeem(bearer)) return null;
  return bearer;
}

async function fetchProperties(url: string, bearer: string, fetchImpl: FetchLike): Promise<DaupProperty[] | null> {
  let response: Response;
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    response = await fetchImpl(url, { method: "GET", headers });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return readPropertyList(await response.json());
  } catch {
    return null;
  }
}

/**
 * Redeem a Hub handoff, then read DAUP Property.
 * An unset list URL is a failed load, not an empty house list.
 * Mock mode never calls the seed and never attaches sample drawings.
 */
export async function loadOwnerProperties(input: PropertyLoadInput): Promise<PropertyLoadOutcome> {
  const mock = resolveMock(input);
  if (mock === "fail") return { ok: false, code: "unreachable" };
  if (mock === "empty") return { ok: true, properties: [] };
  if (mock === "house") return { ok: true, properties: mockProperties(input) };

  const fetchImpl = input.fetchImpl ?? fetch;
  const rawRedeem = (input.houseRedeem || "").trim();
  let bearer = (input.bearer || "").trim();
  if (isHouseRedeem(bearer)) bearer = "";
  if (rawRedeem) {
    if (!isHouseRedeem(rawRedeem)) return { ok: false, code: "redeem" };
    const propertyUrl = input.propertyUrl.trim();
    if (!propertyUrl) return { ok: false, code: "unreachable" };
    const redeemed = await redeemHouse(input.seedOrigin, rawRedeem, fetchImpl);
    if (!redeemed) return { ok: false, code: "redeem" };
    bearer = redeemed;
  }

  const propertyUrl = input.propertyUrl.trim();
  if (!propertyUrl) return { ok: false, code: "unreachable" };
  const properties = await fetchProperties(propertyUrl, bearer, fetchImpl);
  if (!properties) {
    const failure: PropertyLoadFailure = { ok: false, code: "unreachable" };
    if (rawRedeem && bearer) {
      failure.spent = true;
      failure.sessionBearer = bearer;
    }
    return failure;
  }
  const success: PropertyLoadSuccess = { ok: true, properties };
  if (bearer) success.sessionBearer = bearer;
  return success;
}

export type PublicPropertyBody =
  | { ok: true; properties: DaupProperty[] }
  | { ok: false; code: "unreachable" | "redeem"; spent?: boolean };

export function publicPropertyBody(outcome: PropertyLoadOutcome): PublicPropertyBody {
  if (!outcome.ok) {
    const body: PublicPropertyBody = { ok: false, code: outcome.code };
    if (outcome.spent) body.spent = true;
    return body;
  }
  return { ok: true, properties: outcome.properties };
}

export function sessionCookie(bearer: string, secure: boolean): string {
  const parts = [
    `${HOUSE_COOKIE}=${encodeURIComponent(bearer)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=3600",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function bearerFromCookie(header: string | null | undefined): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== HOUSE_COOKIE) continue;
    try {
      return decodeURIComponent(rest.join("=")).trim();
    } catch {
      return "";
    }
  }
  return "";
}
