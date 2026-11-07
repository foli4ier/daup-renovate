# Renovate

Owner app for a DAUP property. Photograph each zone, approve an after picture, keep a private estimate, then push a renovation project and send a scope to CallOut.

English only. One terracotta action on a screen. Budgets stay with the owner.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints. Until a property list answers, the first screen says the load failed. That is not the empty-house screen.

In development, open `?sample=1` for the Esseboom fixture. A banner says the pictures are sample drawings. That flag is ignored in a production build. Sample drawings are never used as a house loaded from Hub.

To try a Hub handoff without the live seed, start the dev server with a local stand-in and open the documented query params (the token below is fake):

```bash
PROPERTY_MOCK=1 npm run dev
```

```
http://localhost:5173/?emailHint=owner@example.com&houseHint=Esseboom&placeIdHint=f331e9fe-793c-4b9a-8574-a7071994e6db&houseRedeem=hr_localmocklocalmock
```

That stand-in is not DAUP Property and it has no photos. `?propertyMock=empty` shows the empty Property screen. `?propertyMock=fail` shows the failed load. `?propertyMock=` is ignored in a production build.

A real handoff redeems `houseRedeem` on this app’s Worker (`POST /api/properties`), which calls `POST https://mcp.daup.co.za/house/session/redeem`. The token is not written to the page, to logs, or to CallOut. The Worker then `GET`s `PROPERTY_URL` with `Authorization: Bearer` and `Accept: application/json`. That URL is `https://property.daup.co.za/api/properties` when unset. The body is `{ "properties": [...] }` with `id`, `name`, `suburb`, `ownerId`, `placeId`, `externalPlaceId`, and `placeName`. `id` is the unit, not the Hub place id. A 200 with `[]` is an empty list. 401 is a failed load. A Hub hint is not turned into a house when nothing matches.

```bash
npm test
npm run build
```

`npm run build` typechecks the app and the Worker, then writes `dist/`. Deploy with Wrangler (`wrangler.json`). The AI binding is `@cf/black-forest-labs/flux-2-klein-9b`.

## Services

Set these when the apps are reachable:

- `PROPERTY_URL` — `https://property.daup.co.za/api/properties`. The Worker uses that when this is unset. Renovate never creates a property. `VITE_PROPERTY_URL` is the same list for the dev server.
- `HOUSE_SEED_URL` — house seed that redeems `houseRedeem`. Defaults to `https://mcp.daup.co.za`.
- `VITE_PROJECT_URL` — create the renovation project. The response must include `projectId` and `url`.
- `VITE_CALLOUT_URL` — one request per zone. The response must include `requestId`.

Until a service answers, Push and Send say nothing was sent. Open in Project uses the URL the project service returned.

Plans and photos stay in this browser.

## Sample drawings

`public/esseboom/` holds drawings for `?sample=1` only. They are labelled Sample in the app. Kitchen is one zone: `Kombuis__kitchen_3` is the starred main view, and `Kombuis__kitchen_1` is the sink wall.

## Pictures

Generate calls the Worker, which runs FLUX.2 [klein] 9B. Cap is 3 successful pictures per zone per plan. A failed try does not count. Photos under about 1 megapixel get a warning and can still be used. If the view drifts, the next try can use FLUX.1 Kontext [pro] when `KONTEXT_API_URL` and `KONTEXT_API_TOKEN` are set. That switch is not shown in the app.

## CallOut

The preview is the scope text plus the before and after photos. It has no amounts. Send is blocked if the text contains an amount, a range, or a budget word. One request per zone.

Quotes compare and completion are not in this build.
