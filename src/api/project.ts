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

export interface ProjectSource {
  createRenovationProject(input: CreateProjectInput): Promise<{ projectId: string }>;
}

export const sampleProjectSource: ProjectSource = {
  async createRenovationProject(input) {
    if (!input.planId || !input.name) {
      throw new Error("nothing-sent");
    }
    return { projectId: `prj_${input.planId}` };
  },
};
