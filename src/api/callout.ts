import { assertClean } from "../lib/leak";
import { carriesHouseRedeem } from "../lib/secrets";
import { ServiceUnreachable } from "./errors";

export type CalloutDraft = {
  planId: string;
  zoneId: string;
  zoneName: string;
  scope: string;
  beforeUrl: string;
  afterUrl: string;
};

export interface CalloutSource {
  sendRequest(input: CalloutDraft): Promise<{ requestId: string }>;
}

/** Body that may be posted to CallOut. Amounts and houseRedeem never leave this function. */
export function calloutJson(input: CalloutDraft): string {
  assertClean(input.scope);
  if (carriesHouseRedeem(input)) throw new ServiceUnreachable();
  return JSON.stringify({
    planId: input.planId,
    zoneId: input.zoneId,
    zoneName: input.zoneName,
    scope: input.scope,
    beforeUrl: input.beforeUrl,
    afterUrl: input.afterUrl,
  });
}

export const calloutSource: CalloutSource = {
  async sendRequest(input) {
    const body = calloutJson(input);
    if (!input.beforeUrl || !input.afterUrl) throw new ServiceUnreachable();
    const url = import.meta.env.VITE_CALLOUT_URL;
    if (!url) throw new ServiceUnreachable();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch {
      throw new ServiceUnreachable();
    }
    if (!response.ok) throw new ServiceUnreachable();
    const data = (await response.json()) as { requestId?: string };
    if (!data.requestId) throw new ServiceUnreachable();
    return { requestId: data.requestId };
  },
};
