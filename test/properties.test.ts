import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calloutJson } from "../src/api/callout.ts";
import { loggableHandoff } from "../src/lib/secrets.ts";
import { captureHubHandoff, readHubHandoff } from "../src/lib/handoff.ts";
import { emptyState, seed } from "../src/data/seed.ts";
import { loadOwnerProperties, publicPropertyBody, sessionCookie } from "../src/lib/propertyLoad.ts";
import { handlePropertyPost } from "../src/lib/propertyRoute.ts";
import { PROPERTY_HOME, PROPERTY_LIST_URL, readPropertyList, unmatchedHouseName } from "../src/lib/properties.ts";
import { redactSecrets } from "../src/lib/secrets.ts";
import { reduce } from "../src/state/reducer.ts";
import { copy } from "../src/copy.ts";

const TOKEN = `hr_${"a".repeat(24)}`;
const PLACE = "f331e9fe-793c-4b9a-8574-a7071994e6db";
const BEARER = "sess_abcdefghijklmnopqrstuvwxyz";

function hints() {
  return new URLSearchParams(
    `emailHint=foli4@icloud.com&houseHint=Esseboom&placeIdHint=${PLACE}&houseRedeem=${TOKEN}`,
  );
}

describe("hub handoff", () => {
  it("reads hints and a well-formed houseRedeem, then strips only the token from the url", () => {
    const handoff = readHubHandoff(hints());
    assert.equal(handoff.emailHint, "foli4@icloud.com");
    assert.equal(handoff.houseHint, "Esseboom");
    assert.deepEqual(handoff.placeIdHints, [PLACE]);
    assert.equal(handoff.houseRedeem, TOKEN);
    let next = "";
    const captured = captureHubHandoff(
      { search: `?${hints().toString()}`, pathname: "/", hash: "" },
      (url) => {
        next = url;
      },
    );
    assert.equal(captured.houseRedeem, TOKEN);
    assert.equal(next.includes("houseRedeem"), false);
    assert.equal(next.includes(TOKEN), false);
    assert.equal(next.includes("houseHint=Esseboom"), true);
    assert.equal(next.includes(`placeIdHint=${PLACE}`), true);
  });

  it("does not keep a token that is not the seed shape", () => {
    const params = new URLSearchParams("houseHint=Esseboom&houseRedeem=not-a-token");
    assert.equal(readHubHandoff(params).houseRedeem, "");
  });
});

describe("property load", () => {
  it("redeems on the seed, then loads properties with the bearer and without the token", async () => {
    const calls: { url: string; body: string; authorization: string }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        body: typeof init?.body === "string" ? init.body : "",
        authorization: headers.get("authorization") || "",
      });
      if (String(url).endsWith("/house/session/redeem")) {
        return new Response(
          JSON.stringify({ ok: true, placeId: PLACE, phone: "+27821234567", placeSession: BEARER }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          properties: [{ id: PLACE, name: "Esseboom", suburb: "Gardens", ownerId: "foli4@icloud.com" }],
        }),
        { status: 200 },
      );
    };
    const outcome = await loadOwnerProperties({
      houseRedeem: TOKEN,
      houseHint: "Esseboom",
      placeIdHints: [PLACE],
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "https://property.example/list",
      fetchImpl,
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.properties[0]?.name, "Esseboom");
    assert.equal(outcome.properties[0]?.id, PLACE);
    assert.equal(calls[0]?.url, "https://mcp.daup.co.za/house/session/redeem");
    assert.equal(calls[0]?.body, JSON.stringify({ houseRedeem: TOKEN }));
    assert.equal(calls[1]?.url, "https://property.example/list");
    assert.equal(calls[1]?.body, "");
    assert.equal(calls[1]?.authorization, `Bearer ${BEARER}`);
    assert.equal(calls[1]?.url.includes(TOKEN), false);
    assert.equal(calls[1]?.authorization.includes(TOKEN), false);
  });

  it("treats a successful empty list as empty, and a failed or missing list as not empty", async () => {
    const empty = await loadOwnerProperties({
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "https://property.example/list",
      fetchImpl: async () => new Response(JSON.stringify({ properties: [] }), { status: 200 }),
    });
    assert.deepEqual(empty, { ok: true, properties: [] });

    const down = await loadOwnerProperties({
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "https://property.example/list",
      fetchImpl: async () => new Response("no", { status: 503 }),
    });
    assert.deepEqual(down, { ok: false, code: "unreachable" });

    const denied = await loadOwnerProperties({
      bearer: BEARER,
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: PROPERTY_LIST_URL,
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(String(url), PROPERTY_LIST_URL);
        assert.equal(headers.get("accept"), "application/json");
        assert.equal(headers.get("authorization"), `Bearer ${BEARER}`);
        return new Response("Sign in required", { status: 401 });
      },
    });
    assert.deepEqual(denied, { ok: false, code: "unreachable" });

    let called = false;
    const unset = await loadOwnerProperties({
      houseRedeem: TOKEN,
      houseHint: "Esseboom",
      placeIdHints: [PLACE],
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "",
      fetchImpl: async () => {
        called = true;
        return new Response("[]");
      },
    });
    assert.equal(called, false);
    assert.deepEqual(unset, { ok: false, code: "unreachable" });
  });

  it("keeps place fields and ignores unknown ones", () => {
    const list = readPropertyList({
      properties: [
        {
          id: "unit_cottage",
          name: "Cottage",
          suburb: "",
          ownerId: "",
          placeId: "place_internal",
          externalPlaceId: PLACE,
          placeName: "Esseboom",
          address: "1 Long Street",
          notes: "ignore me",
        },
      ],
    });
    assert.deepEqual(list, [
      {
        id: "unit_cottage",
        name: "Cottage",
        suburb: "",
        ownerId: "",
        placeId: "place_internal",
        externalPlaceId: PLACE,
        placeName: "Esseboom",
      },
    ]);
    const packed = JSON.stringify(list);
    assert.equal(packed.includes("Long Street"), false);
    assert.equal(packed.includes("ignore me"), false);
  });

  it("does not turn a Hub place record or a dev mock into a loaded house when mock is off", async () => {
    assert.equal(readPropertyList({ places: [{ placeId: PLACE, placeName: "Esseboom" }] }), null);
    const outcome = await loadOwnerProperties({
      houseHint: "Esseboom",
      placeIdHints: [PLACE],
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "",
      allowMock: false,
      mock: "house",
      envMock: true,
      fetchImpl: async () => new Response("[]"),
    });
    assert.deepEqual(outcome, { ok: false, code: "unreachable" });
  });

  it("serves an explicit dev stand-in with no sample drawings", async () => {
    const outcome = await loadOwnerProperties({
      houseHint: "Esseboom",
      placeIdHints: [PLACE],
      emailHint: "owner@example.com",
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "",
      allowMock: true,
      envMock: true,
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.properties.length, 1);
    assert.equal(outcome.properties[0]?.name, "Esseboom");
    assert.equal(JSON.stringify(outcome.properties).includes("esseboom/"), false);
    assert.equal(JSON.stringify(outcome.properties).includes("sample"), false);
  });

  it("rejects a tainted redeem and does not echo the token on the response or cookie", async () => {
    const logs: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const result = await handlePropertyPost({
        body: { houseRedeem: TOKEN, houseHint: "Esseboom", placeIdHints: [PLACE] },
        cookie: null,
        secure: true,
        seedOrigin: "https://mcp.daup.co.za",
        propertyUrl: "https://property.example/list",
        allowMock: false,
        envMock: false,
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: true, placeId: PLACE, token: BEARER, placeSession: BEARER }), { status: 200 }),
      });
      const packed = `${JSON.stringify(result.body)} ${result.setCookie || ""} ${logs.join(" ")}`;
      assert.equal(packed.includes(TOKEN), false);
      assert.equal(result.body.ok, false);
      assert.equal(result.setCookie, undefined);
    } finally {
      console.info = original;
    }
  });

  it("keeps the session cookie free of the redeem token", async () => {
    const result = await handlePropertyPost({
      body: { houseRedeem: TOKEN, houseHint: "Esseboom", placeIdHints: [PLACE] },
      cookie: null,
      secure: true,
      seedOrigin: "https://mcp.daup.co.za",
      propertyUrl: "https://property.example/list",
      allowMock: false,
      envMock: false,
      fetchImpl: async (url) => {
        if (String(url).endsWith("/house/session/redeem")) {
          return new Response(JSON.stringify({ ok: true, placeId: PLACE, placeSession: BEARER }), { status: 200 });
        }
        return new Response(JSON.stringify({ properties: [{ id: PLACE, name: "Esseboom", suburb: "", ownerId: "" }] }), {
          status: 200,
        });
      },
    });
    assert.equal(result.body.ok, true);
    assert.equal(result.setCookie?.includes(TOKEN), false);
    assert.equal(result.setCookie?.includes("houseRedeem"), false);
    assert.equal(result.setCookie?.includes(encodeURIComponent(BEARER)), true);
    assert.equal(JSON.stringify(publicPropertyBody({ ok: true, properties: [], sessionBearer: BEARER })).includes(BEARER), false);
    assert.equal(sessionCookie(BEARER, true).includes("HttpOnly"), true);
  });
});

describe("preselect", () => {
  const property = { id: PLACE, name: "Esseboom", suburb: "Gardens", ownerId: "foli4@icloud.com" };
  const other = { id: "prop_other", name: "Other house", suburb: "", ownerId: "" };

  it("preselects the Hub place id, then the house name", () => {
    const byId = reduce(emptyState(), {
      type: "hydrate-properties",
      properties: [other, property],
      prefer: { houseHint: "Wrong", placeIdHints: [PLACE] },
    });
    assert.equal(byId.activePropertyId, PLACE);
    assert.equal(byId.sample, false);
    const byName = reduce(emptyState(), {
      type: "hydrate-properties",
      properties: [other, { ...property, id: "prop_name" }],
      prefer: { houseHint: "esseboom", placeIdHints: [] },
    });
    assert.equal(byName.activePropertyId, "prop_name");
  });

  it("selects the Hub place by externalPlaceId, then the house by placeName", () => {
    const cottage = {
      id: "unit_cottage",
      name: "Cottage",
      suburb: "",
      ownerId: "",
      placeId: "place_internal",
      externalPlaceId: PLACE,
      placeName: "Esseboom",
    };
    const other = {
      id: "unit_other",
      name: "Other house",
      suburb: "",
      ownerId: "",
      externalPlaceId: "other-place",
      placeName: "Other",
    };
    const byExternal = reduce(emptyState(), {
      type: "hydrate-properties",
      properties: [other, cottage],
      prefer: { houseHint: "Nope", placeIdHints: [PLACE] },
    });
    assert.equal(byExternal.activePropertyId, "unit_cottage");
    assert.equal(byExternal.properties.find((item) => item.id === "unit_cottage")?.externalPlaceId, PLACE);
    assert.notEqual(byExternal.activePropertyId, PLACE);

    const byPlaceName = reduce(emptyState(), {
      type: "hydrate-properties",
      properties: [other, { ...cottage, externalPlaceId: "not-the-hub" }],
      prefer: { houseHint: "esseboom", placeIdHints: ["missing-place"] },
    });
    assert.equal(byPlaceName.activePropertyId, "unit_cottage");

    const firstOfPlace = reduce(emptyState(), {
      type: "hydrate-properties",
      properties: [
        { ...cottage, id: "unit_a", name: "Cottage" },
        { ...cottage, id: "unit_b", name: "Main house" },
      ],
      prefer: { houseHint: "", placeIdHints: [PLACE] },
    });
    assert.equal(firstOfPlace.activePropertyId, "unit_a");
    assert.equal(firstOfPlace.properties.length, 2);
    assert.equal(firstOfPlace.properties.some((item) => item.id === PLACE), false);
  });

  it("does not invent a property, and does not keep sample drawings, when nothing matches", () => {
    const missed = reduce(seed(), {
      type: "hydrate-properties",
      properties: [],
      prefer: { houseHint: "Esseboom", placeIdHints: [PLACE] },
    });
    assert.equal(missed.properties.length, 0);
    assert.equal(missed.photos.length, 0);
    assert.equal(missed.sample, false);
    assert.equal(missed.activePropertyId, "");
    assert.equal(unmatchedHouseName([], { houseHint: "Esseboom", placeIdHints: [PLACE] }), "Esseboom");

    const others = reduce(seed(), {
      type: "hydrate-properties",
      properties: [other],
      prefer: { houseHint: "Esseboom", placeIdHints: [PLACE] },
    });
    assert.equal(others.activePropertyId, "");
    assert.equal(others.properties[0]?.name, "Other house");
    assert.equal(others.photos.some((photo) => photo.url.includes("esseboom")), false);
    assert.equal(others.sample, false);
  });
});

describe("houseRedeem stays out of logs and CallOut", () => {
  it("redacts the token and logs only present or absent", () => {
    const line = redactSecrets(`open /?houseRedeem=${TOKEN}&houseHint=Esseboom`);
    assert.equal(line.includes(TOKEN), false);
    assert.equal(line.includes("Esseboom"), true);
    const logged = loggableHandoff({ houseHint: "Esseboom", placeIdHints: [PLACE], houseRedeem: TOKEN });
    assert.equal(logged.includes(TOKEN), false);
    assert.equal(logged.includes("present"), true);
  });

  it("refuses a CallOut body that carries the token", () => {
    const clean = calloutJson({
      planId: "plan_1",
      zoneId: "zone_1",
      zoneName: "Kitchen",
      scope: "Paint the walls.",
      beforeUrl: "https://example.com/before.jpg",
      afterUrl: "https://example.com/after.jpg",
    });
    assert.equal(clean.includes("houseRedeem"), false);
    assert.equal(clean.includes(TOKEN), false);
    assert.equal(JSON.parse(clean).scope, "Paint the walls.");
    assert.throws(() =>
      calloutJson({
        planId: "plan_1",
        zoneId: "zone_1",
        zoneName: "Kitchen",
        scope: `Paint ${TOKEN}`,
        beforeUrl: "https://example.com/before.jpg",
        afterUrl: "https://example.com/after.jpg",
      }),
    );
    assert.throws(() =>
      calloutJson({
        planId: "plan_1",
        zoneId: "zone_1",
        zoneName: "Kitchen",
        scope: "Paint the walls.",
        beforeUrl: "https://example.com/before.jpg",
        afterUrl: "https://example.com/after.jpg",
        ...{ houseRedeem: TOKEN },
      }),
    );
  });
});

describe("property door", () => {
  it("opens DAUP Property, not the apps directory", () => {
    assert.equal(PROPERTY_HOME, "https://property.daup.co.za");
    assert.equal(PROPERTY_LIST_URL, "https://property.daup.co.za/api/properties");
    assert.equal(copy.openProperty, "Open DAUP Property.");
    assert.match(copy.missingHouse("Esseboom"), /no record for Esseboom/);
    assert.match(copy.emptyProperties, /No properties in DAUP Property yet/);
    assert.match(copy.propertiesFailed, /couldn’t load DAUP Property/i);
  });
});
