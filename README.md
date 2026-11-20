# Neon Vice — cover art maker

Turn your photos and a caption into multi-panel, poster-style cover art and export a
PNG. A fan-made style tool in the spirit of a certain sun-drenched crime saga's box
art: cream-keylined photo panels, a Vice-grade colour wash, big display lettering —
and completely offline, so your photos never leave your machine.

## Run it

The app is plain static files — no build step:

```sh
node serve.ts            # then open http://localhost:8080
```

(or serve `app/` with any static file server.)

- **Photos** — add your own (file picker or drag-and-drop) or start from the four
  built-in samples. Click a panel to select it; drag to reposition its photo, scroll
  to zoom, cycle photos, or swap in the drawn sunset scene.
- **Layouts** — Mosaic (7 panels), Poster, Quad, Trio, Duo, Solo.
- **Grades** — Vice Sunset, Neon Night, Golden Hour, Noir, Clean, with optional retro
  sun, film grain and vignette.
- **Words** — editable title, tagline and foot line in Anton or Bebas Neue, with
  sunset / gold / pink / white fills, placed top or bottom.
- **Export** — one click to a PNG at 1080×1080, 1080×1350 or 1920×1080. The preview
  canvas is the export resolution, so what you see is exactly what you save.

## Entry plumbing

`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set, or `/output` by default) copies `app/`
and `screenshots/` into the output directory and writes `dossier.json` there with the
kit's vendored library — that dossier is the hand-in for the make.fun
gta6-cover-art-01 bounty.

Neon Vice is an original work: it is not affiliated with Rockstar Games or Take-Two
Interactive and contains no artwork, logos or fonts from any game. The title fonts,
Anton and Bebas Neue, are licensed under the SIL Open Font License (see `app/fonts/`).
