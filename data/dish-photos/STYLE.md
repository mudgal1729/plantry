# Dish photo style spec

The single source of truth for how every Plantry dish photo looks. Photos are
AI-generated, one dish at a time, by filling the prompt template below with a
dish's name and a short description and running it through an image model. Every
image, for the 121 dishes in the library today and all ~80 dishes the expansion
batches will add, is generated from this one document, so the whole library
reads as if one photographer shot it on one afternoon (Decision #4 in
`features/design-revamp.md` §3). The consistency lives in this committed spec,
not in anyone's memory: a run six months from now, on a different machine, that
follows this file produces a photo that sits next to the originals without a
seam.

This is an internal spec. Claude Code cannot generate images, so the actual
files are produced outside the session (a human runs the prompt through an image
model) and dropped into `data/dish-photos/` in a later content batch (track B2.2+
in `features/design-revamp.md` §4.2). This file is the committable half of the
work: it fixes the look before any pixels exist.

---

## Prompt template

Fill the two slots from the dish's data file, then run verbatim. `{dish name}`
is the file's `name` field; `{short description}` is the first body paragraph of
the dish file (the one-line description), trimmed to a phrase. Everything outside
the slots is fixed and must not be reworded between runs (the fixed wording is
what holds the style steady).

```
A single appetizing serving of {dish name}, an Indian home-cooked dish
({short description}), photographed from directly overhead (flat lay, 90-degree
top-down). The dish is plated in or on simple matte stoneware in a warm cream or
soft terracotta tone, centered in the frame with even space on all sides.
Set on a plain warm-cream linen or matte ceramic surface with no visible table
edge, no other plates, no cutlery, no hands, no text, no garnish clutter; at most
one small, quiet prop (a folded cream napkin corner or a single spice bowl) only
if the frame would otherwise feel empty. Soft, diffuse natural daylight from the
upper left, gentle shadows, no harsh highlights, no flash. Warm, inviting,
slightly muted home-kitchen color, true to how the dish actually looks when
cooked at home (not glossy restaurant styling, not oversaturated). The food fills
roughly the central two-thirds of a square frame with comfortable headroom on
every edge. Sharp focus on the food, shallow background blur. Realistic
photographic style, natural food textures. Square 1:1 composition.
```

Notes for whoever runs it:
- Keep the fixed sentences exactly as written; only the two slots change. Swapping
  the boilerplate is how a library drifts into two looks.
- If the model returns a non-square image or one cropped tight to the edges,
  regenerate rather than post-processing. The output should arrive web-ready
  (see Output below) with no editing step in the pipeline.
- Do not add per-dish art direction ("on a banana leaf", "with a side of rice")
  unless the dish genuinely is that thing; the point is uniformity.

---

## Style parameters

Each is fixed for the whole library. They are also encoded in the prompt above;
this section is the human-readable contract, the prompt is the machine input.

- **Framing and angle.** Directly overhead, flat lay, 90-degree top-down. One
  serving, centered, with even margins. Top-down is the one angle that survives
  both crops the UI applies (see Crop below), which is why it is fixed rather
  than left to taste.
- **Lighting.** Soft, diffuse natural daylight from the upper left. Gentle
  shadows, no harsh specular highlights, no on-camera flash. Bright enough to
  read on a phone in daylight, never blown out.
- **Plating and styling.** Simple matte stoneware (a bowl for gravies and dals, a
  plate for dry dishes and breads) in a warm cream or soft terracotta tone that
  echoes the app's surfaces. The food looks home-cooked and honest, not
  restaurant-glazed or styled with tweezers.
  - **Props policy:** minimal. No cutlery, no hands, no second plate, no text or
    labels, no busy garnish. At most one quiet prop (a folded cream napkin corner
    or a single small spice bowl) and only when the frame would otherwise feel
    empty. When in doubt, leave it out; an empty margin is on-style, clutter is
    not.
- **Background.** A plain warm-cream surface (linen or matte ceramic) with no
  visible table edge and nothing else in frame. The background is a quiet field,
  never a scene.
- **Color and mood.** Warm, inviting, slightly muted, true-to-home. The palette
  sits with the handoff direction (warm cream surfaces, terracotta accent; tokens
  `--pt-bg #F7F2E9`, `--pt-surface #FFFDF9`, `--pt-accent #BC5430` in
  `design_handoff/hifi-tokens.jsx`). Natural saturation, not the oversaturated,
  high-contrast look of stock food photography.
- **Crop and aspect ratio.** Square, 1:1. The source is square on purpose: the
  PWA renders photos with `object-fit: cover` at two very different shapes, a
  small rounded square thumbnail on day cards and dish rows (about 40 to 48 px,
  `design_handoff/hifi-primitives.jsx`) and a wide, short hero strip on Explore
  cards (full width, 96 px tall, `design_handoff/hifi-screens.jsx`). A centered
  subject in a square frame survives both: the square thumb is a lossless
  center, and the wide strip center-crops without ever clipping the dish.
  Generate with the food centered and comfortable headroom on all four edges so
  neither crop touches it.
- **Output size and format.** Web-ready at generation, no post-processing
  dependency in the pipeline (slice 1.2 carried over a no-image-processing-library
  constraint; photos arrive already sized). Target a square JPEG, roughly
  1024 x 1024 px (a clean source for the small thumbnail and the wide strip
  alike), quality tuned so each file lands well under ~300 KB to keep the PWA
  bundle light. Format is `.jpg`. No alpha channel needed (photos are always
  full-bleed). If a model only emits PNG, convert to JPEG before committing; do
  not commit PNGs.

---

## Naming and placement

- One file per dish at `data/dish-photos/<slug>.jpg`, where `<slug>` exactly
  matches the dish's file slug (the `data/dishes/<slug>.md` basename). Example:
  the dish in `data/dishes/chicken-masala-gravy.md` gets
  `data/dish-photos/chicken-masala-gravy.jpg`.
- When the image lands, the dish file's optional `photo:` frontmatter field is
  set to the bare filename, `photo: chicken-masala-gravy.jpg` (the field already
  exists in the schema; see `engine/src/data/schemas.ts` and `docs/engine.md`
  §field reference). The blocking validator only fires on a **declared** `photo:`,
  so setting it and committing the file happen together in the same content-batch
  PR, never apart. This spec does not set any `photo:` field; that is the photo
  batches' job.
- Slugs are stable and never reused (slice 1.2 discipline), so a filename, once
  chosen, is permanent.

---

## Coverage

Photos are optional during the transition. The PWA has a no-photo fallback (a
quiet diagonal-stripe placeholder with a `+`, in the `Thumb` primitive), so a
dish without a photo renders as a clean text card rather than a broken image, and
partial coverage never looks broken. Photo batches (B2.2+) burn coverage down
toward complete; the coverage report (`npm run reports`) tracks the percentage of
active dishes with a photo. There is no deadline by which every dish must have
one; the library is allowed to be partially photographed indefinitely without any
screen looking wrong.
