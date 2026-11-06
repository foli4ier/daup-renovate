import type { Zone, ZoneKind } from "../state/types";

const TEMPLATE: { key: string; name: string; kind: ZoneKind; order: number; hidden: boolean }[] = [
  { key: "front", name: "Front yard", kind: "outside", order: 1, hidden: false },
  { key: "back", name: "Back yard", kind: "outside", order: 2, hidden: false },
  { key: "side", name: "Side yard", kind: "outside", order: 3, hidden: false },
  { key: "living", name: "Living area", kind: "inside", order: 4, hidden: false },
  { key: "kitchen", name: "Kitchen", kind: "inside", order: 5, hidden: false },
  { key: "bath", name: "Bathroom 1", kind: "inside", order: 6, hidden: false },
  { key: "sun", name: "Sun room (stoep)", kind: "inside", order: 7, hidden: false },
  { key: "bed1", name: "Bedroom 1", kind: "inside", order: 8, hidden: true },
  { key: "bed2", name: "Bedroom 2", kind: "inside", order: 9, hidden: true },
  { key: "bed3", name: "Bedroom 3", kind: "inside", order: 10, hidden: true },
  { key: "garage", name: "Garage", kind: "inside", order: 11, hidden: true },
  { key: "roof", name: "Roof & gutters", kind: "outside", order: 12, hidden: true },
];

export function defaultZones(propertyId: string): Zone[] {
  return TEMPLATE.map((item) => ({
    id: `zone_${propertyId}_${item.key}`,
    propertyId,
    key: item.key,
    name: item.name,
    kind: item.kind,
    order: item.order,
    hidden: item.hidden,
    answers: [],
  }));
}
