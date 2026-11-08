import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { emptyState, STORAGE_KEY } from "../src/data/seed.ts";
import { loadOwner, saveOwner, type Bucket, type PictureBytes } from "../src/state/persist.ts";
import { emptyLink, type Photo, type Proposal, type State } from "../src/state/types.ts";

const FRONT_BEFORE = "FRONT_BEFORE_BYTES";
const BACK_BEFORE = "BACK_BEFORE_BYTES";
const FRONT_AFTER = "FRONT_AFTER_BYTES";
const BACK_AFTER = "BACK_AFTER_BYTES";
const SENT_BEFORE = "SENT_BEFORE_BYTES";
const SENT_AFTER = "SENT_AFTER_BYTES";
const PATH = "/esseboom/front-yard-before.svg";

function dataUrl(token: string): string {
  return `data:image/jpeg;base64,${token}`;
}

function photo(id: string, zoneId: string, url: string): Photo {
  return { id, zoneId, url, width: 1200, height: 900, starred: true };
}

function proposal(id: string, zoneId: string, beforePhotoId: string, imageUrl: string): Proposal {
  return {
    id,
    planId: "plan_1",
    zoneId,
    beforePhotoId,
    imageUrl,
    createdAt: "2026-11-08T00:00:00.000Z",
    source: "generated",
  };
}

function planWithPictures(): State {
  return {
    ...emptyState(),
    properties: [
      { id: "prop_1", name: "Esseboom", suburb: "Gardens", ownerId: "owner_you", coverPhotoId: "photo_front" },
    ],
    zones: [
      { id: "zone_front", propertyId: "prop_1", key: "front", name: "Front yard", kind: "outside", order: 1, hidden: false, answers: [] },
      { id: "zone_back", propertyId: "prop_1", key: "back", name: "Back yard", kind: "outside", order: 2, hidden: false, answers: [] },
    ],
    photos: [
      photo("photo_front", "zone_front", dataUrl(FRONT_BEFORE)),
      photo("photo_back", "zone_back", dataUrl(BACK_BEFORE)),
      photo("photo_path", "zone_front", PATH),
    ],
    plans: [
      {
        id: "plan_1",
        propertyId: "prop_1",
        name: "Refresh",
        status: "draft",
        createdAt: "2026-11-08T00:00:00.000Z",
        phasesApproved: false,
        phases: [],
      },
    ],
    links: [{ ...emptyLink("plan_1", "zone_front"), styleNote: "Keep the data: and the roof line." }],
    proposals: [
      proposal("proposal_front", "zone_front", "photo_front", dataUrl(FRONT_AFTER)),
      proposal("proposal_back", "zone_back", "photo_back", dataUrl(BACK_AFTER)),
    ],
    requests: [
      {
        id: "req_1",
        planId: "plan_1",
        zoneId: "zone_front",
        scope: "Paint the front.",
        beforeUrl: dataUrl(SENT_BEFORE),
        afterUrl: dataUrl(SENT_AFTER),
        createdAt: "2026-11-08T00:02:00.000Z",
      },
    ],
    activePropertyId: "prop_1",
    activePlanId: "plan_1",
  };
}

function memoryBucket(initial: string | null = null): Bucket & { value: string | null; keys: string[] } {
  const keys: string[] = [];
  const box = { value: initial, keys };
  return {
    keys,
    get value() {
      return box.value;
    },
    getItem(key) {
      keys.push(`get:${key}`);
      return box.value;
    },
    setItem(key, value) {
      keys.push(`set:${key}`);
      box.value = value;
    },
  };
}

function memoryBytes(): PictureBytes & { saved: Map<string, string>; puts: number } {
  const saved = new Map<string, string>();
  const stats = { puts: 0 };
  return {
    saved,
    get puts() {
      return stats.puts;
    },
    async put(records) {
      stats.puts += 1;
      for (const record of records) saved.set(record.id, record.dataUrl);
    },
    async get(ids) {
      const found = new Map<string, string>();
      for (const id of ids) {
        const value = saved.get(id);
        if (value) found.set(id, value);
      }
      return found;
    },
    async delete(ids) {
      for (const id of ids) saved.delete(id);
    },
  };
}

function quotaError(): DOMException {
  return new DOMException(
    "Failed to execute 'setItem' on 'Storage': Setting the value of 'daup-renovate-v2' exceeded the quota.",
    "QuotaExceededError",
  );
}

function stored(bucket: { value: string | null }): string {
  return bucket.value ?? "";
}

describe("picture persistence", () => {
  it("keeps picture bytes out of the plan document and restores them", async () => {
    const state = planWithPictures();
    const bucket = memoryBucket();
    const bytes = memoryBytes();
    const known = new Map<string, string>();
    const unresolved = new Set<string>();

    const saved = await saveOwner(bucket, bytes, state, known, unresolved);
    assert.equal(saved, true);
    const json = stored(bucket);
    assert.equal(json.includes("data:image"), false);
    for (const token of [FRONT_BEFORE, BACK_BEFORE, FRONT_AFTER, BACK_AFTER, SENT_BEFORE, SENT_AFTER]) {
      assert.equal(json.includes(token), false, token);
    }
    assert.equal(json.includes("pic:photo:photo_front"), true);
    assert.equal(json.includes("pic:photo:photo_back"), true);
    assert.equal(json.includes("pic:proposal:proposal_back"), true);
    assert.equal(json.includes("pic:request:req_1:before"), true);
    assert.equal(json.includes("pic:request:req_1:after"), true);
    assert.equal(json.includes(PATH), true);
    assert.equal(json.includes("Keep the data: and the roof line."), true);
    assert.equal(bytes.saved.has("photo:photo_path"), false);
    assert.equal(bytes.saved.get("photo:photo_front"), dataUrl(FRONT_BEFORE));
    assert.equal(bytes.saved.get("proposal:proposal_back"), dataUrl(BACK_AFTER));
    assert.equal(bucket.keys.every((key) => key.endsWith(STORAGE_KEY)), true);

    const puts = bytes.puts;
    const again = await saveOwner(bucket, bytes, state, known, unresolved);
    assert.equal(again, true);
    assert.equal(bytes.puts, puts);

    const loaded = await loadOwner(bucket, bytes, new Map());
    assert.equal(loaded.state.plans[0]?.name, "Refresh");
    assert.equal(loaded.state.links[0]?.styleNote, "Keep the data: and the roof line.");
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_front")?.url, dataUrl(FRONT_BEFORE));
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_back")?.url, dataUrl(BACK_BEFORE));
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_path")?.url, PATH);
    assert.equal(loaded.state.proposals.find((item) => item.id === "proposal_front")?.imageUrl, dataUrl(FRONT_AFTER));
    assert.equal(loaded.state.proposals.find((item) => item.id === "proposal_back")?.imageUrl, dataUrl(BACK_AFTER));
    assert.equal(loaded.state.requests[0]?.beforeUrl, dataUrl(SENT_BEFORE));
    assert.equal(loaded.state.requests[0]?.afterUrl, dataUrl(SENT_AFTER));
    assert.equal(stored(bucket).includes("data:image"), false);
  });

  it("migrates a v2 plan that still embeds data URLs", async () => {
    const state = planWithPictures();
    const bucket = memoryBucket(JSON.stringify(state));
    const bytes = memoryBytes();
    const loaded = await loadOwner(bucket, bytes, new Map());
    const json = stored(bucket);

    assert.equal(json.includes("data:image"), false);
    assert.equal(json.includes(FRONT_BEFORE), false);
    assert.equal(json.includes(BACK_AFTER), false);
    assert.equal(json.includes(SENT_BEFORE), false);
    assert.equal(json.includes("pic:photo:photo_back"), true);
    assert.equal(json.includes(PATH), true);
    assert.equal(json.includes("Refresh"), true);
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_front")?.url, dataUrl(FRONT_BEFORE));
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_back")?.url, dataUrl(BACK_BEFORE));
    assert.equal(loaded.state.proposals.find((item) => item.id === "proposal_back")?.imageUrl, dataUrl(BACK_AFTER));
    assert.equal(loaded.state.requests[0]?.beforeUrl, dataUrl(SENT_BEFORE));
    assert.equal(loaded.state.requests[0]?.afterUrl, dataUrl(SENT_AFTER));
    assert.equal(bytes.puts, 1);

    const known = new Map<string, string>();
    const again = await loadOwner(bucket, bytes, known);
    assert.equal(bytes.puts, 1);
    assert.equal(again.state.photos.find((item) => item.id === "photo_back")?.url, dataUrl(BACK_BEFORE));
    assert.equal(stored(bucket).includes("data:image"), false);
  });

  it("keeps a second zone's after with the first zone's pictures", async () => {
    const state = planWithPictures();
    const bucket = memoryBucket(JSON.stringify(state));
    const bytes = memoryBytes();
    const known = new Map<string, string>();
    await loadOwner(bucket, bytes, known);
    const withSecond = {
      ...state,
      proposals: [
        ...state.proposals,
        proposal("proposal_back_2", "zone_back", "photo_back", dataUrl("SECOND_ZONE_AFTER")),
      ],
    };
    const saved = await saveOwner(bucket, bytes, withSecond, known, new Set());
    assert.equal(saved, true);
    const json = stored(bucket);
    assert.equal(json.includes("data:image"), false);
    assert.equal(json.includes("SECOND_ZONE_AFTER"), false);
    assert.equal(json.includes(FRONT_BEFORE), false);
    assert.equal(bytes.saved.get("proposal:proposal_back_2"), dataUrl("SECOND_ZONE_AFTER"));
    assert.equal(bytes.saved.get("photo:photo_front"), dataUrl(FRONT_BEFORE));
    const loaded = await loadOwner(bucket, bytes, new Map());
    assert.equal(loaded.state.proposals.find((item) => item.id === "proposal_back_2")?.imageUrl, dataUrl("SECOND_ZONE_AFTER"));
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_front")?.url, dataUrl(FRONT_BEFORE));
  });

  it("drops a removed picture and leaves the others", async () => {
    const state = planWithPictures();
    const bucket = memoryBucket();
    const bytes = memoryBytes();
    const known = new Map<string, string>();
    const unresolved = new Set<string>();
    await saveOwner(bucket, bytes, state, known, unresolved);
    const next = { ...state, photos: state.photos.filter((item) => item.id !== "photo_back") };
    const saved = await saveOwner(bucket, bytes, next, known, unresolved);
    assert.equal(saved, true);
    assert.equal(bytes.saved.has("photo:photo_back"), false);
    assert.equal(bytes.saved.get("photo:photo_front"), dataUrl(FRONT_BEFORE));
    const json = stored(bucket);
    assert.equal(json.includes("pic:photo:photo_back"), false);
    assert.equal(json.includes("pic:photo:photo_front"), true);
    assert.equal(json.includes(BACK_BEFORE), false);
  });

  it("keeps the previous plan when setItem throws QuotaExceededError", async () => {
    const state = planWithPictures();
    const bytes = memoryBytes();
    const known = new Map<string, string>();
    const prepared = memoryBucket();
    assert.equal(await saveOwner(prepared, bytes, state, known, new Set()), true);
    const slim = stored(prepared);
    let value = slim;
    let writes = 0;
    const bucket: Bucket = {
      getItem() {
        return value;
      },
      setItem() {
        writes += 1;
        throw quotaError();
      },
    };
    const extra = proposal("proposal_back_2", "zone_back", "photo_back", dataUrl("SECOND_ZONE_AFTER"));
    const next = { ...state, proposals: [...state.proposals, extra] };
    const saved = await saveOwner(bucket, bytes, next, known, new Set());
    assert.equal(saved, false);
    assert.equal(writes, 1);
    assert.equal(value, slim);
    assert.equal(value.includes("SECOND_ZONE_AFTER"), false);
    assert.equal(value.includes("data:image"), false);
    assert.equal(copy.saveFailed, "We could not save that on this phone. Your pictures are still here – try again.");
  });

  it("does not replace a stored plan when the picture store fails", async () => {
    const state = planWithPictures();
    const fat = JSON.stringify(state);
    let wrote = false;
    const bucket: Bucket = {
      getItem() {
        return fat;
      },
      setItem() {
        wrote = true;
      },
    };
    const bytes: PictureBytes = {
      async put() {
        throw quotaError();
      },
      async get() {
        return new Map();
      },
      async delete() {
        throw new Error("delete");
      },
    };
    await assert.doesNotReject(() => saveOwner(bucket, bytes, state, new Map(), new Set()));
    assert.equal(await saveOwner(bucket, bytes, state, new Map(), new Set()), false);
    assert.equal(wrote, false);
    assert.equal(fat.includes(FRONT_BEFORE), true);
  });

  it("still opens an old plan when migration cannot write", async () => {
    const state = planWithPictures();
    const fat = JSON.stringify(state);
    const bucket: Bucket = {
      getItem() {
        return fat;
      },
      setItem() {
        throw quotaError();
      },
    };
    const bytes = memoryBytes();
    const loaded = await loadOwner(bucket, bytes, new Map());
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_front")?.url, dataUrl(FRONT_BEFORE));
    assert.equal(loaded.state.proposals.find((item) => item.id === "proposal_back")?.imageUrl, dataUrl(BACK_AFTER));
    assert.equal(fat.includes(FRONT_BEFORE), true);
    assert.equal(bytes.saved.get("photo:photo_front"), dataUrl(FRONT_BEFORE));
  });

  it("does not overwrite a missing picture with a placeholder", async () => {
    const state = planWithPictures();
    const bucket = memoryBucket(JSON.stringify(state));
    const bytes = memoryBytes();
    const known = new Map<string, string>();
    await loadOwner(bucket, bytes, known);
    bytes.saved.delete("photo:photo_back");
    const loaded = await loadOwner(bucket, bytes, new Map());
    const back = loaded.state.photos.find((item) => item.id === "photo_back");
    assert.ok(back);
    assert.equal(back.url.startsWith("data:"), true);
    assert.equal(back.url.includes(BACK_BEFORE), false);
    const saved = await saveOwner(bucket, bytes, loaded.state, known, loaded.unresolved);
    assert.equal(saved, true);
    const json = stored(bucket);
    assert.equal(json.includes("pic:photo:photo_back"), true);
    assert.equal(json.includes("R0lGODlhAQAB"), false);
    assert.equal(bytes.saved.has("photo:photo_back"), false);
    assert.equal(bytes.saved.get("photo:photo_front"), dataUrl(FRONT_BEFORE));
  });

  it("opens a v2 plan that has no thread yet", async () => {
    const state = planWithPictures();
    const legacy = { ...state, messages: undefined };
    const bucket = memoryBucket(JSON.stringify(legacy));
    const loaded = await loadOwner(bucket, memoryBytes(), new Map());
    assert.deepEqual(loaded.state.messages, []);
    assert.equal(loaded.state.photos.find((item) => item.id === "photo_front")?.url, dataUrl(FRONT_BEFORE));
  });
});
