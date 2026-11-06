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

export const propertySource: PropertySource = {
  async listProperties() {
    const url = import.meta.env.VITE_PROPERTY_URL;
    if (!url) return [];
    const response = await fetch(url);
    if (!response.ok) throw new Error("property-unavailable");
    const data = (await response.json()) as { properties?: DaupProperty[] } | DaupProperty[];
    if (Array.isArray(data)) return data;
    return data.properties ?? [];
  },
};
