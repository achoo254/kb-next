---
title: Landing lag and narrow-window layout
date: 2026-11-04
summary: "Orbit dots repainted the scene every frame (34->59 fps); landing now stacks below 1180px"
---

# Landing lag and narrow-window layout

## What happened
- kb.hoandat.com landing idled at 34-35 fps (1440x900). A/B in the live page: pausing `.kf-orbit-dot` -> 59-60 fps; other effects (bloom, stars, crystal filters) ~no change.
- Cause: the 12 dots animate `offset-distance` (main thread in Chrome) with no layer of their own, so each frame repainted the layer holding the bloom SVG + filtered crystals.
- Phones: the S01 board keeps absolute 1440x900 coordinates; the hero (left 96px, width 340px) and sign-in CTA were cut off at 390px.

## Changes
- `apps/web/src/ui/orbit-field.css`: `will-change: transform` on `.kf-orbit-dot` -> 59 fps (shared kit: S01, C09, kit pages).
- `apps/web/src/pages/landing-page.css`: below 1180px stack the hero, a scene scaled via `container-type` + `scale(tan(atan2(100cqw, 960px)))` (crop x 220-1180, y 20-640, fallback scale 0.375, focus rings rescaled), feature cards in a column. Below 480px the signed-in top "Enter the Universe" hides (overlapped the logo in English at 421px; the hero CTA duplicates it).
- e2e: `orbit-dots-layer.spec.ts`, `narrow-layout.spec.ts` (fail before, pass after). Row added to `docs/mock-deviations.md`.

## Decision
- User chose "stack on mobile, desktop unchanged" (no phone/tablet board for S01). Parity S01 unchanged at 1.50%.

## Next steps
- Pre-existing on Windows: C09 parity 3.47-3.58% (> 3%), Meilisearch tests (no win32 binary), brand-files test (autocrlf), `pnpm lint` check:brand quoting under cmd.exe, check:public flags its own test file.
- Not done: image sizes (480px crystal art shown at 168px, no srcset), Cloud crystal overlapping the hero text on desktop (documented slot).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
