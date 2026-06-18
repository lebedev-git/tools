// Copies the self-hosted ffmpeg.wasm assets into apps/web/public/ffmpeg so the
// browser can load them same-origin (see apps/web/lib/ffmpegAudio.ts for why
// same-origin is required). Runs automatically before `dev` and `build` via the
// pre-scripts in apps/web/package.json. The files are gitignored and regenerated
// from node_modules, so the ~32 MB wasm never lands in the repo.

import { createRequire } from "node:module";
import { cpSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..", "apps", "web");
// Resolve packages from the web app's context (where they are declared).
const require = createRequire(join(webRoot, "package.json"));

const dest = join(webRoot, "public", "ffmpeg");
mkdirSync(dest, { recursive: true });

// `@ffmpeg/*` block ./package.json in their "exports", so walk up from the
// resolved entry point to the package root instead.
function pkgUmdDir(pkg) {
  let d = dirname(require.resolve(pkg));
  while (!existsSync(join(d, "package.json"))) {
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return join(d, "dist", "umd");
}

// @ffmpeg/ffmpeg: main script + worker chunk(s) (e.g. 814.ffmpeg.js).
const ffUmd = pkgUmdDir("@ffmpeg/ffmpeg");
for (const f of readdirSync(ffUmd)) {
  if (f.endsWith(".js")) cpSync(join(ffUmd, f), join(dest, f));
}

// @ffmpeg/core: glue js + wasm.
const coreUmd = pkgUmdDir("@ffmpeg/core");
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  cpSync(join(coreUmd, f), join(dest, f));
}

console.log("[copy-ffmpeg] ffmpeg assets copied to", dest);
