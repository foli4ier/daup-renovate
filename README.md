# Renovate

Owner app for a DAUP property. Photograph each zone, approve an after picture, keep a private estimate, then push a renovation project and send a scope to CallOut.

English only. One terracotta action on a screen. Budgets stay with the owner.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints. With no property service configured, the first screen is the empty DAUP Property state.

In development, open `?sample=1` for the Esseboom fixture. A banner says the pictures are sample drawings. That flag is ignored in a production build.

```bash
npm test
npm run build
```

`npm run build` typechecks the app and the Worker, then writes `dist/`. Deploy with Wrangler (`wrangler.json`). The AI binding is `@cf/black-forest-labs/flux-2-klein-9b`.

## Services

Set these when the apps are reachable:

- `VITE_PROPERTY_URL` — list of properties. Renovate never creates one.
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
