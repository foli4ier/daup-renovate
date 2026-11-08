import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserHouseClient, interpretDocument } from "../src/api/housePlan.ts";
import { copy } from "../src/copy.ts";
import { emptyState } from "../src/data/seed.ts";
import { bytesToDataUrl, picturePayload } from "../src/lib/pictureFit.ts";
import { decodePictureId, encodePictureId } from "../src/lib/pictureKey.ts";
import { HOUSE_COOKIE } from "../src/lib/propertyLoad.ts";
import { handleRenovateRequest } from "../src/lib/renovateRoute.ts";
import { syncHousePlans, type HouseClient, type PictureRead, type SyncMarks } from "../src/state/houseSync.ts";
import { isEffectivelyEmpty, mergeProperty, sliceProperty } from "../src/state/slice.ts";
import { reduce } from "../src/state/reducer.ts";
import { emptyLink, type State, type ThreadMessage } from "../src/state/types.ts";

const BEARER = "sess_abcdefghijklmnopqrstuvwxyz";
const T1 = "2026-11-08T00:00:00.000Z";
const T2 = "2026-11-08T01:00:00.000Z";
const T3 = "2026-11-08T02:00:00.000Z";
const PHOTO_BYTES = new Uint8Array([1, 2, 3, 4]);
const BEFORE_BYTES = new Uint8Array([5, 6, 7]);
const AFTER_BYTES = new Uint8Array([8, 9, 10]);
const PROPOSAL_BYTES = new Uint8Array([11, 12]);

function jpeg(bytes: Uint8Array): string {
  return bytesToDataUrl(bytes, "image/jpeg");
}

function message(id: string, zoneId: string, text: string): ThreadMessage {
  return { id, zoneId, authorId: "owner", text, createdAt: T1 };
}

function listed(): State {
  return reduce(emptyState(), {
    type: "hydrate-properties",
    properties: [
      { id: "house-a", name: "House A", suburb: "Gardens", ownerId: "owner@example.com" },
      { id: "house-b", name: "House B", suburb: "", ownerId: "owner@example.com" },
    ],
    prefer: { houseHint: "House A", placeIdHints: ["house-a"] },
  });
}

function remotePlan(): State {
  const zoneId = "zone_a_kitchen";
  return {
    ...emptyState(),
    properties: [
      { id: "house-a", name: "Stale name", suburb: "Old", ownerId: "owner@example.com", coverPhotoId: "photo_front" },
    ],
    zones: [
      { id: zoneId, propertyId: "house-a", key: "kitchen", name: "Kitchen", kind: "inside", order: 1, hidden: false, answers: [] },
    ],
    photos: [{ id: "photo_front", zoneId, url: "pic:photo:photo_front", width: 800, height: 600, starred: true }],
    plans: [
      { id: "plan_one", propertyId: "house-a", name: "Summer", status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
      { id: "plan_two", propertyId: "house-a", name: "Winter", status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
    ],
    links: [{ ...emptyLink("plan_one", zoneId), styleNote: "Keep the window." }],
    proposals: [
      {
        id: "proposal_1",
        planId: "plan_one",
        zoneId,
        beforePhotoId: "photo_front",
        imageUrl: "pic:proposal:proposal_1",
        createdAt: T1,
        source: "generated",
      },
    ],
    requests: [
      {
        id: "req_1",
        planId: "plan_one",
        zoneId,
        scope: "Paint the kitchen.",
        beforeUrl: "pic:request:req_1:before",
        afterUrl: "pic:request:req_1:after",
        createdAt: T1,
      },
    ],
    messages: [message("msg_a", zoneId, "Keep the window.")],
    activePropertyId: "house-a",
    activePlanId: "plan_one",
  };
}

function pictures(): Map<string, Uint8Array> {
  return new Map([
    ["photo__photo_front", PHOTO_BYTES],
    ["proposal__proposal_1", PROPOSAL_BYTES],
    ["request__req_1__before", BEFORE_BYTES],
    ["request__req_1__after", AFTER_BYTES],
  ]);
}

type Call = { method: string; propertyId: string; pictureId?: string; document?: unknown; contentType?: string };

function mockClient(options: {
  read?: (propertyId: string) => Awaited<ReturnType<HouseClient["readDocument"]>>;
  pictures?: Map<string, Uint8Array>;
  write?: Awaited<ReturnType<HouseClient["writeDocument"]>>;
  pictureWrite?: { ok: true } | { ok: false; reason: "too-large" | "unreachable" | "unauthorized" | "forbidden" };
}): HouseClient & { calls: Call[] } {
  const calls: Call[] = [];
  const library = options.pictures ?? new Map<string, Uint8Array>();
  return {
    calls,
    async readDocument(propertyId) {
      calls.push({ method: "GET", propertyId });
      return options.read?.(propertyId) ?? { ok: true, found: false };
    },
    async writeDocument(propertyId, document) {
      calls.push({ method: "PUT", propertyId, document });
      return options.write ?? { ok: true, updatedAt: T2 };
    },
    async readPicture(propertyId, pictureId): Promise<PictureRead> {
      calls.push({ method: "GET", propertyId, pictureId });
      const bytes = library.get(pictureId);
      if (!bytes) return { ok: false };
      return { ok: true, bytes, contentType: "image/jpeg" };
    },
    async writePicture(propertyId, pictureId, picture) {
      calls.push({ method: "PUT", propertyId, pictureId, contentType: picture.contentType });
      library.set(pictureId, picture.bytes);
      return options.pictureWrite ?? { ok: true };
    },
    async deletePicture(propertyId, pictureId) {
      calls.push({ method: "DELETE", propertyId, pictureId });
      library.delete(pictureId);
      return true;
    },
  };
}

describe("picture ids", () => {
  it("round-trips colon keys without putting a colon in the house id", () => {
    const photo = "photo:photo_123e4567-e89b-12d3-a456-426614174000";
    const proposal = "proposal:proposal_123e4567-e89b-12d3-a456-426614174000";
    const before = "request:123e4567-e89b-12d3-a456-426614174000:before";
    const after = "request:123e4567-e89b-12d3-a456-426614174000:after";
    for (const localId of [photo, proposal, before, after]) {
      const remoteId = encodePictureId(localId);
      assert.ok(remoteId);
      assert.equal(remoteId.includes(":"), false);
      assert.ok(remoteId.length <= 128);
      assert.match(remoteId, /^[A-Za-z0-9_-]{1,128}$/);
      assert.equal(decodePictureId(remoteId), localId);
    }
    assert.equal(encodePictureId(photo), "photo__photo_123e4567-e89b-12d3-a456-426614174000");
    assert.equal(encodePictureId(before), "request__123e4567-e89b-12d3-a456-426614174000__before");
  });

  it("still round-trips a key that already contains a double underscore", () => {
    const localId = "request:ab__cd:before";
    const remoteId = encodePictureId(localId);
    assert.ok(remoteId);
    assert.equal(remoteId.includes(":"), false);
    assert.equal(decodePictureId(remoteId), localId);
    assert.equal(encodePictureId(`photo:${"a".repeat(200)}`), null);
  });
});

describe("property slices", () => {
  it("merges one house without wiping the other house's plan or thread", () => {
    const base = listed();
    const zoneB = base.zones.find((zone) => zone.propertyId === "house-b" && zone.key === "kitchen");
    assert.ok(zoneB);
    const local: State = {
      ...base,
      plans: [
        {
          id: "plan_b",
          propertyId: "house-b",
          name: "B plan",
          status: "draft",
          createdAt: T1,
          phasesApproved: false,
          phases: [],
        },
      ],
      messages: [message("msg_b", zoneB.id, "B thread")],
      activePropertyId: "house-a",
      activePlanId: null,
    };
    assert.equal(isEffectivelyEmpty(sliceProperty(local, "house-a")), true);
    assert.equal(isEffectivelyEmpty(sliceProperty(local, "house-b")), false);

    const merged = mergeProperty(local, "house-a", remotePlan());
    assert.equal(merged.properties.find((item) => item.id === "house-a")?.name, "House A");
    assert.equal(merged.properties.find((item) => item.id === "house-a")?.coverPhotoId, "photo_front");
    assert.equal(merged.zones.some((zone) => zone.id === "zone_house-a_front"), false);
    assert.equal(merged.zones.some((zone) => zone.id === "zone_a_kitchen"), true);
    assert.equal(merged.zones.some((zone) => zone.id === zoneB.id), true);
    assert.deepEqual(
      merged.plans.filter((plan) => plan.propertyId === "house-a").map((plan) => plan.name),
      ["Summer", "Winter"],
    );
    assert.equal(merged.plans.find((plan) => plan.id === "plan_b")?.name, "B plan");
    assert.equal(merged.messages.find((item) => item.id === "msg_b")?.text, "B thread");
    assert.equal(merged.messages.find((item) => item.id === "msg_a")?.text, "Keep the window.");
    assert.equal(merged.activePropertyId, "house-a");
    assert.equal(merged.activePlanId, "plan_one");
    assert.equal(sliceProperty(merged, "house-b").messages[0]?.text, "B thread");
    assert.equal(sliceProperty(merged, "house-a").plans.length, 2);
  });
});

describe("house sync", () => {
  it("uploads a local plan when the house has none", async () => {
    const local = listed();
    const zoneId = "zone_a_kitchen";
    const state: State = {
      ...local,
      zones: local.zones.map((zone) => (zone.propertyId === "house-a" && zone.key === "kitchen" ? { ...zone, id: zoneId, name: "Kitchen" } : zone)),
      photos: [{ id: "photo_front", zoneId, url: jpeg(PHOTO_BYTES), width: 10, height: 10, starred: true }],
      plans: [
        { id: "plan_one", propertyId: "house-a", name: "Summer", status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
      ],
      messages: [message("msg_a", zoneId, "Keep the window.")],
      activePropertyId: "house-a",
      activePlanId: "plan_one",
    };
    const client = mockClient({
      read: (propertyId) => (propertyId === "house-a" ? { ok: true, found: false } : { ok: true, found: false }),
    });
    const result = await syncHousePlans({
      state,
      propertyIds: ["house-a", "house-b"],
      marks: {},
      unresolved: new Set(),
      client,
      fit: async (dataUrl) => picturePayload(dataUrl),
    });
    const put = client.calls.find((call) => call.method === "PUT" && call.propertyId === "house-a" && !call.pictureId);
    assert.ok(put);
    const packed = JSON.stringify(put.document);
    assert.equal(packed.includes("data:image"), false);
    assert.equal(packed.includes("pic:photo:photo_front"), true);
    assert.equal(packed.includes("Keep the window."), true);
    const picture = client.calls.find((call) => call.pictureId);
    assert.equal(picture?.pictureId, "photo__photo_front");
    assert.equal(picture?.pictureId?.includes(":"), false);
    assert.equal(picture?.contentType, "image/jpeg");
    assert.equal(client.calls.some((call) => call.propertyId === "house-b" && call.method === "PUT"), false);
    assert.equal(result.marks["house-a"]?.serverUpdatedAt, T2);
    assert.equal(result.marks["house-a"]?.localUpdatedAt, T2);
    assert.equal(result.state.photos[0]?.url, jpeg(PHOTO_BYTES));
    assert.equal(result.notice, "ok");
  });

  it("hydrates an empty cache from the house, including pictures and the zone thread", async () => {
    const local = listed();
    const zoneB = local.zones.find((zone) => zone.propertyId === "house-b" && zone.key === "front");
    assert.ok(zoneB);
    const state: State = {
      ...local,
      plans: [
        { id: "plan_b", propertyId: "house-b", name: "B plan", status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
      ],
      messages: [message("msg_b", zoneB.id, "B thread")],
    };
    const client = mockClient({
      read: (propertyId) =>
        propertyId === "house-a"
          ? { ok: true, found: true, updatedAt: T2, document: remotePlan() }
          : { ok: true, found: true, updatedAt: T1, document: sliceProperty(state, "house-b") },
      pictures: pictures(),
    });
    const result = await syncHousePlans({
      state,
      propertyIds: ["house-a", "house-b"],
      marks: { "house-b": { serverUpdatedAt: T1, localUpdatedAt: T1 } },
      unresolved: new Set(),
      client,
      fit: async (dataUrl) => picturePayload(dataUrl),
    });
    assert.equal(client.calls.some((call) => call.method === "PUT"), false);
    assert.equal(result.state.plans.find((plan) => plan.id === "plan_one")?.name, "Summer");
    assert.equal(result.state.plans.find((plan) => plan.id === "plan_two")?.name, "Winter");
    assert.equal(result.state.plans.find((plan) => plan.id === "plan_b")?.name, "B plan");
    assert.equal(result.state.messages.find((item) => item.id === "msg_a")?.text, "Keep the window.");
    assert.equal(result.state.messages.find((item) => item.id === "msg_b")?.text, "B thread");
    assert.equal(result.state.photos.find((photo) => photo.id === "photo_front")?.url, jpeg(PHOTO_BYTES));
    assert.equal(result.state.proposals[0]?.imageUrl, jpeg(PROPOSAL_BYTES));
    assert.equal(result.state.requests[0]?.beforeUrl, jpeg(BEFORE_BYTES));
    assert.equal(result.state.requests[0]?.afterUrl, jpeg(AFTER_BYTES));
    assert.equal(result.state.properties.find((item) => item.id === "house-a")?.name, "House A");
    assert.equal(result.state.activePlanId, "plan_one");
    assert.deepEqual(
      client.calls.filter((call) => call.pictureId).map((call) => call.pictureId),
      ["photo__photo_front", "proposal__proposal_1", "request__req_1__before", "request__req_1__after"],
    );
    assert.equal(result.marks["house-a"]?.serverUpdatedAt, T2);
  });

  it("lets the newer local plan win, and the newer house plan win", async () => {
    const zoneId = "zone_a_kitchen";
    const base = listed();
    function withName(name: string): State {
      return {
        ...base,
        zones: base.zones.map((zone) =>
          zone.propertyId === "house-a" && zone.key === "kitchen" ? { ...zone, id: zoneId, name: "Kitchen" } : zone,
        ),
        plans: [
          { id: "plan_one", propertyId: "house-a", name, status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
        ],
        activePropertyId: "house-a",
        activePlanId: "plan_one",
      };
    }
    function house(name: string, updatedAt: string) {
      return {
        ok: true as const,
        found: true as const,
        updatedAt,
        document: { ...withName(name), properties: withName(name).properties.filter((item) => item.id === "house-a") },
      };
    }

    const localNewer = mockClient({ read: () => house("House copy", T1) });
    const pushed = await syncHousePlans({
      state: withName("Local copy"),
      propertyIds: ["house-a"],
      marks: { "house-a": { serverUpdatedAt: T1, localUpdatedAt: T2 } },
      unresolved: new Set(),
      client: localNewer,
      fit: async () => null,
    });
    assert.equal(pushed.state.plans[0]?.name, "Local copy");
    assert.equal(localNewer.calls.some((call) => call.method === "PUT" && !call.pictureId), true);

    const houseNewer = mockClient({ read: () => house("House copy", T2) });
    const pulled = await syncHousePlans({
      state: withName("Local copy"),
      propertyIds: ["house-a"],
      marks: { "house-a": { serverUpdatedAt: T1, localUpdatedAt: T1 } },
      unresolved: new Set(),
      client: houseNewer,
      fit: async () => null,
    });
    assert.equal(pulled.state.plans.find((plan) => plan.propertyId === "house-a")?.name, "House copy");
    assert.equal(houseNewer.calls.some((call) => call.method === "PUT"), false);

    const bothLocal = mockClient({ read: () => house("House copy", T2) });
    const localWins = await syncHousePlans({
      state: withName("Local copy"),
      propertyIds: ["house-a"],
      marks: { "house-a": { serverUpdatedAt: T1, localUpdatedAt: T3 } },
      unresolved: new Set(),
      client: bothLocal,
      fit: async () => null,
    });
    assert.equal(localWins.state.plans[0]?.name, "Local copy");
    assert.equal(bothLocal.calls.some((call) => call.method === "PUT" && !call.pictureId), true);

    const bothHouse = mockClient({ read: () => house("House copy", T3) });
    const houseWins = await syncHousePlans({
      state: withName("Local copy"),
      propertyIds: ["house-a"],
      marks: { "house-a": { serverUpdatedAt: T1, localUpdatedAt: T2 } },
      unresolved: new Set(),
      client: bothHouse,
      fit: async () => null,
    });
    assert.equal(houseWins.state.plans.find((plan) => plan.propertyId === "house-a")?.name, "House copy");
    assert.equal(bothHouse.calls.some((call) => call.method === "PUT"), false);
  });

  it("keeps local pictures when the house refuses the save", async () => {
    const local = listed();
    const zoneId = local.zones.find((zone) => zone.propertyId === "house-a" && zone.key === "kitchen")?.id;
    assert.ok(zoneId);
    const url = jpeg(PHOTO_BYTES);
    const state: State = {
      ...local,
      photos: [{ id: "photo_front", zoneId, url, width: 10, height: 10, starred: true }],
      plans: [
        { id: "plan_one", propertyId: "house-a", name: "Summer", status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
      ],
      activePropertyId: "house-a",
      activePlanId: "plan_one",
    };
    const client = mockClient({
      read: () => ({ ok: true, found: false }),
      write: { ok: false, reason: "too-large" },
    });
    const result = await syncHousePlans({
      state,
      propertyIds: ["house-a"],
      marks: {},
      unresolved: new Set(),
      client,
      fit: async (dataUrl) => picturePayload(dataUrl),
    });
    assert.equal(result.notice, "too-large");
    assert.equal(result.state.photos[0]?.url, url);
    assert.equal(result.state.plans[0]?.name, "Summer");
    assert.equal(result.syncedIds.includes("house-a"), false);
    assert.equal(client.calls.some((call) => call.pictureId), false);

    const partial = mockClient({
      read: () => ({ ok: true, found: true, updatedAt: T1, document: remotePlan() }),
      write: { ok: true, updatedAt: T2 },
      pictureWrite: { ok: false, reason: "too-large" },
    });
    const again = await syncHousePlans({
      state,
      propertyIds: ["house-a"],
      marks: { "house-a": { serverUpdatedAt: T1, localUpdatedAt: T2 } },
      unresolved: new Set(),
      client: partial,
      fit: async (dataUrl) => picturePayload(dataUrl),
    });
    assert.equal(again.notice, "too-large");
    assert.equal(again.state.photos[0]?.url, url);
    assert.equal(again.state.plans[0]?.name, "Summer");
    assert.ok(again.marks["house-a"]?.localUpdatedAt);
    assert.ok(again.marks["house-a"]?.serverUpdatedAt);
    assert.equal((again.marks["house-a"]?.localUpdatedAt ?? "") > (again.marks["house-a"]?.serverUpdatedAt ?? ""), true);
    assert.equal(copy.houseSaveFailed, "The house could not hold that save. Your pictures are still here – try again.");
    assert.equal(copy.houseSaveFailed.endsWith("."), true);
  });

  it("does not upload a sample session or replace the cache when the house is unreachable", async () => {
    const sample: State = { ...remotePlan(), sample: true };
    const client = mockClient({});
    client.readDocument = () => {
      throw new Error("sample");
    };
    const result = await syncHousePlans({
      state: sample,
      propertyIds: ["house-a"],
      marks: {},
      unresolved: new Set(),
      client,
      fit: async () => {
        throw new Error("sample");
      },
    });
    assert.equal(result.state, sample);
    assert.equal(result.notice, "ok");

    const local = listed();
    const down = mockClient({ read: () => ({ ok: false, reason: "unreachable" }) });
    const kept = await syncHousePlans({
      state: local,
      propertyIds: ["house-a"],
      marks: {},
      unresolved: new Set(),
      client: down,
      fit: async () => null,
    });
    assert.equal(kept.state, local);
    assert.equal(down.calls.some((call) => call.method === "PUT"), false);
    assert.equal(kept.syncedIds.includes("house-a"), false);

    const denied = mockClient({ read: () => ({ ok: false, reason: "unauthorized" }) });
    const still = await syncHousePlans({
      state: local,
      propertyIds: ["house-a"],
      marks: {},
      unresolved: new Set(),
      client: denied,
      fit: async () => null,
    });
    assert.equal(still.state, local);
    assert.equal(denied.calls.some((call) => call.method === "PUT"), false);

    const html = interpretDocument(404, null);
    assert.equal(html.ok, false);
    const page = browserHouseClient(async () => new Response("<html>missing</html>", { status: 404, headers: { "content-type": "text/html" } }));
    const read = await page.readDocument("house-a");
    assert.deepEqual(read, { ok: false, reason: "unreachable" });
  });

  it("converts a non-jpeg before upload and deletes a picture the plan dropped", async () => {
    const local = listed();
    const zoneId = "zone_a_kitchen";
    const state: State = {
      ...local,
      zones: local.zones.map((zone) => (zone.propertyId === "house-a" && zone.key === "kitchen" ? { ...zone, id: zoneId } : zone)),
      photos: [{ id: "photo_front", zoneId, url: "data:image/webp;base64,AAAA", width: 10, height: 10, starred: true }],
      plans: [
        { id: "plan_one", propertyId: "house-a", name: "Summer", status: "draft", createdAt: T1, phasesApproved: false, phases: [] },
      ],
      activePropertyId: "house-a",
      activePlanId: "plan_one",
    };
    const marks: SyncMarks = { "house-a": { serverUpdatedAt: T1, localUpdatedAt: T2, pictureIds: ["photo:photo_old"] } };
    let fitted = "";
    const client = mockClient({
      read: () => ({ ok: true, found: true, updatedAt: T1, document: { ...state, photos: [], plans: state.plans } }),
    });
    await syncHousePlans({
      state,
      propertyIds: ["house-a"],
      marks,
      unresolved: new Set(),
      client,
      fit: async (dataUrl) => {
        fitted = dataUrl;
        return { bytes: PHOTO_BYTES, contentType: "image/jpeg" };
      },
    });
    assert.equal(fitted, "data:image/webp;base64,AAAA");
    const uploaded = client.calls.find((call) => call.method === "PUT" && call.pictureId);
    assert.equal(uploaded?.pictureId, "photo__photo_front");
    assert.equal(uploaded?.contentType, "image/jpeg");
    const removed = client.calls.find((call) => call.method === "DELETE");
    assert.equal(removed?.pictureId, "photo__photo_old");
    assert.equal(removed?.pictureId?.includes(":"), false);
  });
});

describe("renovate proxy", () => {
  it("sends the house cookie as a bearer and does not put it on the response", async () => {
    const calls: { url: string; authorization: string; cookie: string; accept: string }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        authorization: headers.get("authorization") || "",
        cookie: headers.get("cookie") || "",
        accept: headers.get("accept") || "",
      });
      return new Response(
        JSON.stringify({
          updatedAt: T2,
          document: {
            version: 2,
            sample: false,
            properties: [{ id: "house-a", name: "House A", ownerId: "owner@example.com" }],
            zones: [],
            plans: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json", "set-cookie": `daup-session=${BEARER}` } },
      );
    };
    const response = await handleRenovateRequest(new Request("https://renovate.example/api/renovate/house-a"), {
      cookie: `${HOUSE_COOKIE}=${encodeURIComponent(BEARER)}`,
      propertyUrl: "https://property.daup.co.za/api/properties",
      fetchImpl,
    });
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    assert.equal(calls[0]?.url, "https://property.daup.co.za/api/renovate/house-a");
    assert.equal(calls[0]?.authorization, `Bearer ${BEARER}`);
    assert.equal(calls[0]?.cookie, "");
    assert.equal(calls[0]?.accept, "application/json");
    assert.equal(text.includes(BEARER), false);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(Object.hasOwn(body, "email"), false);
    assert.equal(Object.hasOwn(body, "role"), false);
    assert.equal(Object.hasOwn(body, "token"), false);
    assert.equal(Object.hasOwn(body, "bearer"), false);
    const document = body.document as { properties: { name: string }[] };
    assert.equal(document.properties[0]?.name, "House A");
  });

  it("drops a response that echoes the bearer, a token, a role, or an email field", async () => {
    const leaked = await handleRenovateRequest(new Request("https://renovate.example/api/renovate/house-a"), {
      cookie: `${HOUSE_COOKIE}=${encodeURIComponent(BEARER)}`,
      propertyUrl: "https://property.example/api/properties",
      fetchImpl: async () =>
        new Response(JSON.stringify({ updatedAt: T2, document: { note: BEARER }, token: "secret-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const leakedText = await leaked.text();
    assert.equal(leaked.status, 403);
    assert.equal(leakedText.includes(BEARER), false);
    assert.equal(leakedText.includes("secret-token"), false);

    const role = await handleRenovateRequest(new Request("https://renovate.example/api/renovate/house-a"), {
      cookie: `${HOUSE_COOKIE}=${encodeURIComponent(BEARER)}`,
      propertyUrl: "https://property.example/api/properties",
      fetchImpl: async () =>
        new Response(JSON.stringify({ updatedAt: T2, document: {}, role: "superuser-role", email: "owner@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const roleText = await role.text();
    assert.equal(role.status, 403);
    assert.equal(roleText.includes("superuser-role"), false);
    assert.equal(roleText.includes("owner@example.com"), false);
  });

  it("proxies picture bytes and rejects a colon in the picture id", async () => {
    let contentType = "";
    let size = 0;
    const response = await handleRenovateRequest(
      new Request("https://renovate.example/api/renovate/house-a/pictures/photo__photo_front", {
        method: "PUT",
        headers: { "content-type": "image/jpeg", cookie: `${HOUSE_COOKIE}=${encodeURIComponent(BEARER)}` },
        body: PHOTO_BYTES,
      }),
      {
        cookie: `${HOUSE_COOKIE}=${encodeURIComponent(BEARER)}`,
        propertyUrl: "https://property.daup.co.za/api/properties",
        fetchImpl: async (_url, init) => {
          const headers = new Headers(init?.headers);
          contentType = headers.get("content-type") || "";
          const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
          size = bytes.byteLength;
          assert.equal(headers.get("authorization"), `Bearer ${BEARER}`);
          return new Response(null, { status: 204 });
        },
      },
    );
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(contentType, "image/jpeg");
    assert.equal(size, PHOTO_BYTES.byteLength);
    assert.equal(response.headers.get("cache-control"), "no-store");

    let called = false;
    const rejected = await handleRenovateRequest(
      new Request("https://renovate.example/api/renovate/house-a/pictures/photo:photo_front"),
      {
        cookie: `${HOUSE_COOKIE}=${encodeURIComponent(BEARER)}`,
        propertyUrl: "https://property.daup.co.za/api/properties",
        fetchImpl: async () => {
          called = true;
          return new Response("no");
        },
      },
    );
    assert.equal(rejected.status, 400);
    assert.equal(called, false);
    const body = await rejected.json() as { error?: string };
    assert.equal(body.error, "bad_request");
    assert.equal(JSON.stringify(body).includes(BEARER), false);
  });

  it("calls the same-origin route with the cookie and without a bearer", async () => {
    let authorization = "unset";
    let credentials = "";
    const client = browserHouseClient(async (url, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization") || "";
      credentials = init?.credentials || "";
      assert.equal(String(url), "/api/renovate/house-a");
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    });
    const read = await client.readDocument("house-a");
    assert.deepEqual(read, { ok: true, found: false });
    assert.equal(authorization, "");
    assert.equal(credentials, "include");
  });
});
