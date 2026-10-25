# Grant Test Auto hero

A 3D hero page: a simulated wet lab whose researchers send purchase requests to
a network of Grant Test Auto's finance agents, and get bought, rerouted, blocked or
held back. The story is scripted (`src/feed/`), but every verdict comes from
the real spending rules in `server/src/rules.ts`.

## Run

    npm --prefix hero install
    npm --prefix hero run dev       # http://127.0.0.1:5190
    npm --prefix hero run check     # typecheck, story and code-name checks, build

The dev page is a gallery of mockups: keys 1 to 5 open round 2 (`#a1` to `#a5`),
6 opens round 1's Clay lab, 0 the overview.

URL options: `?bare` hides the gallery strip, `?at=<ms>` starts the story partway
in (`npm --prefix hero run story` prints the beat times), `?hq` keeps full quality.

## Deploy (its own Vercel project)

| Setting | Value |
|---|---|
| Root directory | `hero` |
| Include files outside the root directory | on (the feed imports `server/src/rules.ts` and `vocab.ts`; they need no packages) |
| Build command | `npm run build` |
| Output directory | `dist` |
| `VITE_HERO_VARIANT` | the version to ship, e.g. `a1`. It drops the gallery, the number keys and the overview |
| `VITE_APP_URL` | optional; where "Open the Grant Test Auto app" goes (default `https://calhacks130.vercel.app`) |

If WebGL cannot start, the page shows a still fallback with the app link
instead of a blank screen.
