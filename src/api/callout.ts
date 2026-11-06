import { assertClean } from "../lib/leak";
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

export const calloutSource: CalloutSource = {
  async sendRequest(input) {
    assertClean(input.scope);
    if (!input.beforeUrl || !input.afterUrl) throw new ServiceUnreachable();
    const url = import.meta.env.VITE_CALLOUT_URL;
    if (!url) throw new ServiceUnreachable();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
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
