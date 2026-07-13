# grilling-sleek skill assets

This directory is a **self-contained skill**. The files here are vendored copies
so the skill works without depending on the repo's build output or a global
install:

| File | Source of truth | Why it's here |
| --- | --- | --- |
| `grill.js` | `cli/dist/grill.js` (built from `cli/src/` via esbuild) | The bundled CLI the agent invokes through `node`. Zero runtime deps; the Grilling schema is compiled in. |
| `schemas/grilling.json` | `server/schemas/grilling.json` | Authoritative Grilling schema (what the CLI validates against). |
| `schemas/response.json` | `server/schemas/response.json` | Response shape, for reference when parsing poll output. |

**Do not hand-edit these files.** They are rebuild artifacts. To refresh them
after changing `cli/src/` or `server/schemas/`, rebuild the CLI and copy the
outputs back here:

```bash
# from repo root
(cd cli && ./node_modules/.bin/esbuild src/grill.ts \
   --bundle --outfile=dist/grill.js --platform=node --target=node22 \
   --format=cjs '--banner:js=#!/usr/bin/env node' --loader:.json=json)
cp cli/dist/grill.js           skills/grilling-sleek/grill.js
cp server/schemas/grilling.json skills/grilling-sleek/schemas/grilling.json
cp server/schemas/response.json skills/grilling-sleek/schemas/response.json
chmod +x skills/grilling-sleek/grill.js
```

Only `SKILL.md` is authored by hand.
