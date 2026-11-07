import { bearerFromCookie, loadOwnerProperties, publicPropertyBody, sessionCookie, type PropertyMock } from "./propertyLoad";

export type PropertyRouteResult = {
  status: number;
  body: ReturnType<typeof publicPropertyBody>;
  setCookie?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMock(value: unknown): PropertyMock {
  return value === "house" || value === "empty" || value === "fail" ? value : "";
}

/**
 * Same-origin property load. The page posts the handoff once.
 * The token is redeemed here and is not copied onto the response or the cookie.
 */
export async function handlePropertyPost(input: {
  body: unknown;
  cookie: string | null;
  secure: boolean;
  seedOrigin: string;
  propertyUrl: string;
  allowMock: boolean;
  envMock: boolean;
  fetchImpl?: typeof fetch;
}): Promise<PropertyRouteResult> {
  const record = isRecord(input.body) ? input.body : {};
  const placeRaw = record.placeIdHints;
  const placeIdHints = Array.isArray(placeRaw) ? placeRaw.filter((item): item is string => typeof item === "string") : [];
  const outcome = await loadOwnerProperties({
    houseRedeem: typeof record.houseRedeem === "string" ? record.houseRedeem : "",
    emailHint: typeof record.emailHint === "string" ? record.emailHint : "",
    houseHint: typeof record.houseHint === "string" ? record.houseHint : "",
    placeIdHints,
    bearer: bearerFromCookie(input.cookie),
    seedOrigin: input.seedOrigin,
    propertyUrl: input.propertyUrl,
    allowMock: input.allowMock,
    envMock: input.envMock,
    mock: readMock(record.mock),
    fetchImpl: input.fetchImpl,
  });
  const body = publicPropertyBody(outcome);
  const result: PropertyRouteResult = { status: 200, body };
  if (outcome.sessionBearer) result.setCookie = sessionCookie(outcome.sessionBearer, input.secure);
  return result;
}
