// Neon Vice — hand-in program for the make.fun gta6-cover-art-01 bounty (Node 22, stdlib only).
//
// The deliverable is the static web app under app/ — plain files, no build step, no network.
// This program packages it the way the grader expects: app/ and screenshots/ are copied into
// the output directory and dossier.json is written there by the kit's vendored library
// (vendor/makefun-app.ts, kept byte-for-byte identical to the kit's copy). The dossier is
// the summary the judge reads, so the caps below mirror the gate's own limits — handing in
// something the scorer would refuse is worse than failing loudly here.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// To try the app itself: `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Gate limits for this bounty (from the kit's reference gate): up to 4 screenshots of
// 256 KiB each, up to 993 entries / 48 MiB under app/, app paths at most 1000 bytes,
// and the dossier's source text capped at 160 KiB.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
