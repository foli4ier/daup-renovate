# Renovate

Owner app for a DAUP property. Photograph each zone, approve an after picture, keep a private estimate, then push a renovation project and send a scope to CallOut.

English only. One terracotta action on a screen. Budgets stay with the owner.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The Esseboom sample is already loaded: Front yard, Living area, Kitchen, and Bathroom 1 have pictures to review. Back yard, Side yard, and Sun room (stoep) still need photos.

```bash
npm test
npm run build
```

`npm run build` typechecks the app and the Worker, then writes `dist/`. Deploy with Wrangler (`wrangler.json`). The AI binding is `@cf/black-forest-labs/flux-2-klein-9b`.

## Sample data

Property, Project, and CallOut are interfaces with an Esseboom sample (`src/api`). Renovate never creates properties. Plans, photos, and estimates stay in this browser (`localStorage`). On You, **Load the Esseboom sample again.** puts the sample back.

The bundled scenes under `public/esseboom/` stand in for the Esseboom photographs so the flow runs without those files. Kitchen keeps two shots of one zone. `Kombuis__kitchen_3` is the starred main view. `Kombuis__kitchen_1` is the sink wall, and the after picture belongs to that shot.

## Pictures

Generate calls the Worker, which runs FLUX.2 [klein] 9B. Cap is 3 pictures per zone per plan. A failed try does not count. Photos under about 1 megapixel get a warning and can still be used. If the owner says the picture changed something they wanted to keep, the next try can use FLUX.1 Kontext [pro] when `KONTEXT_API_URL` and `KONTEXT_API_TOKEN` are set. That switch is not shown in the app.

Without the AI binding, the first try for a sample photo uses the bundled after picture. Another try shows the failure line and does not use up the cap.

## CallOut

The preview is the scope text plus the before and after photos. It has no amounts. Send is blocked if the text contains an amount, a range, or a budget word. One request per zone.

Quotes compare and completion are the next slice. They are not in this build.
