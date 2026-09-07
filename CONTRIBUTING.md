# Contributing

Thanks for helping. The codebase is small on purpose; keep it that way.

## Setup

```bash
npm install
npm run dev
```

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run test:integration   # needs ~1 minute, renders real clips with ffmpeg
```

## Where things live

- Pure logic (planner, parsers, encoder args) goes in `src/shared/` and gets a unit test in `tests/`.
- Anything that spawns ffmpeg lives in `src/main/`. Build command lines as arrays, never as shell strings.
- UI is React in `src/renderer/`. Overlays are drawn on a canvas; do not add ffmpeg `drawtext` (fonts differ per OS).
- New settings: add to `Settings` + `DEFAULT_SETTINGS` in `src/shared/types.ts`, then to the panel that owns it. Settings persist automatically.

## Rules of thumb

- Every ffmpeg change must keep `npm run test:integration` green and must terminate: looped still images
  need a `-t` bound and overlays need `shortest=1` (see the comment in `filtergraph.ts`).
- Output stays 1080×1920 H.264 + AAC. Platforms re-encode anyway; exotic codecs only cause upload failures.
- Keep the UI readable at 1024×700.

## Releasing

Tag a commit `vX.Y.Z` and push it. GitHub Actions builds Windows, macOS (arm64 + x64) and Linux packages and
attaches them to a draft release.
