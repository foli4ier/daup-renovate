import { ServiceUnreachable } from "./errors";

export type ProjectPhaseInput = {
  name: string;
  days: number;
  startsAfter: string[];
};

export type CreateProjectInput = {
  propertyId: string;
  planId: string;
  name: string;
  phases: ProjectPhaseInput[];
  /** Owner estimate only. Never copy this onto a CallOut request. */
  estimate: { low: number; high: number; currency: "ZAR" } | null;
};

export type ProjectResult = {
  projectId: string;
  url: string;
};

export interface ProjectSource {
  createRenovationProject(input: CreateProjectInput): Promise<ProjectResult>;
}

export const projectSource: ProjectSource = {
  async createRenovationProject(input) {
    const url = import.meta.env.VITE_PROJECT_URL;
    if (!url || !input.planId || !input.name) throw new ServiceUnreachable();
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
    const data = (await response.json()) as { projectId?: string; url?: string };
    if (!data.projectId || !data.url) throw new ServiceUnreachable();
    return { projectId: data.projectId, url: data.url };
  },
};
