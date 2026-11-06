import { assertClean } from "../lib/leak";

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

export const sampleCalloutSource: CalloutSource = {
  async sendRequest(input) {
    assertClean(input.scope);
    if (!input.beforeUrl || !input.afterUrl) {
      throw new Error("missing-photo");
    }
    return { requestId: `req_${input.zoneId}` };
  },
};
