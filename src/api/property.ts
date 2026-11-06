export type DaupProperty = {
  id: string;
  name: string;
  suburb: string;
  ownerId: string;
};

/** Read-only. Renovate never creates properties. */
export interface PropertySource {
  listProperties(): Promise<DaupProperty[]>;
}

export const samplePropertySource: PropertySource = {
  async listProperties() {
    return [{ id: "prop_esseboom", name: "Esseboom", suburb: "", ownerId: "owner_you" }];
  },
};
