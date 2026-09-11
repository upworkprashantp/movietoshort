<p align="center">
  <img src="docs/icon.png" width="96" alt="MovieToShort icon" />
</p>

<h1 align="center">MovieToShort</h1>

<p align="center">
  Turn long videos into numbered shorts or a quick highlights recap, or combine many clips into one video, for YouTube Shorts, Instagram Reels, TikTok and more.<br/>
  Paste a link from 1,000+ sites or drop a file. Free, open source, runs entirely on your own computer.
</p>

<p align="center">
  <img src="docs/screenshot.png" width="900" alt="MovieToShort screenshot" />
</p>

- **No account, no upload, no watermark, no limits.** Everything happens on your machine.
- **Windows, macOS and Linux.** One-click installers, or `npm install && npm run dev` from source.
- **MIT licensed.** Fork it, ship it, build on it.

## What it does

1. **Paste a video link or drop a video file.** Links are fetched with [yt-dlp](https://github.com/yt-dlp/yt-dlp), so any public video page it supports works. Files are read with ffmpeg, so any format works.
2. **Skip the intro and the credits** with two time fields.
3. **Split into parts** of 30 s to 3 min (up to 10 min for TikTok). Cuts are moved onto natural pauses so no part ends mid-sentence, and every part is the same length (no 12-second "Part 47").
4. **Render vertical 1080×1920 videos** with a **Part 1, Part 2, …** badge, a progress bar, a "Part N ▶" teaser at the end of each part, an optional title hook and channel watermark.
5. **Post.** A `captions.txt` with ready-to-paste titles and hashtags for every part is written next to the videos.

Everything is previewed before you render, at the exact pixels that will be exported.

## Three modes

Switch at the top of the window. The look, branding and output folder are shared by all three.

| Mode | In | Out |
| --- | --- | --- |
| **Split** | One long video, link or file | Numbered shorts: Part 1, Part 2 … (described above) |
| **Highlights** | One long video, link or file | One silent recap, for example 2 minutes of 2.5 second snippets spread from start to end |
| **Combine** | Many links and files | One longer video, clip after clip, or simply every clip downloaded |

### Highlights: a 30 minute video as a 2 minute recap

Pick the recap length (30 s to 3 min) and the length of each snippet (1 to 5 s). The snippets are spread
evenly from the first usable second to the last, so the recap walks through the whole video in order.
A 30 minute video at 2 minutes with 2.5 second snippets gives 48 snippets, one about every 37 seconds.
Skip start and skip end still apply.

The recap is silent on purpose, because sound chopped into 2 second pieces is unpleasant to listen to.
Add a trending sound in the Shorts, Reels or TikTok editor when you post.

### Combine: many clips into one video

Paste any number of links, one per line, and add or drop video files. Links download one at a time
with their own progress. Reorder with the arrows, retry a failed link, stop and resume the queue.

- **Combine into one video.** Clips of any size, frame rate or audio format are fitted to one frame and
  joined in order. A clip without sound gets silence so everything after it stays in sync, and each
  clip's loudness is evened out so no creator is louder than the rest. Clips that all share one upright
  shape keep it; a mix of shapes goes on the 1080×1920 canvas.
- **Save clips only.** Copies every ready clip to the output folder unchanged, numbered in list order.
  This is the batch downloader.

A sources list with each clip's title and link is saved next to the combined video, so you can credit
the creators.

### Already-short videos stay one clip

Feed it a Reel, a TikTok or a Short and there is nothing to split. The app notices and switches to
**single clip**: one file out, at the source's own size. A 1080×1080 square stays square, a 720×1280
clip stays 720×1280. Nothing is re-framed, letterboxed or cropped, because the picture already fits.

That clip still gets your branding:

- **Intro title** slides up and fades in over the opening seconds, then fades away.
- **Channel watermark** sits above the caption area for the whole clip.
- **Call to action** ("Follow for more", or your own words) fades in at the end.
- **Progress bar** along the bottom edge.

The **Output** control in *Trim & split* forces the choice when you disagree: *Auto*, *Split into
parts*, or *Single clip*. The **Output size** control in *Look* does the same for the frame: *Auto*,
a full *1080×1920* canvas, or *Keep source*.

## Supported inputs

| Input | Works with |
| --- | --- |
| **Links** | Everything on yt-dlp's [supported sites list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md): YouTube, Vimeo, TikTok, X / Twitter, Instagram, Facebook, Twitch VODs and clips, Dailymotion, Reddit, Rumble, Bilibili, Odysee, Streamable, Google Drive links, direct `.mp4` / `.m3u8` URLs and 1,000+ more. |
| **Files** | Anything ffmpeg decodes: MP4, MOV, MKV, WEBM, AVI, TS / M2TS, MTS, WMV, FLV, MPG / MPEG, 3GP, OGV, VOB, M4V… with H.264, H.265 / HEVC, VP9, AV1, ProRes, MPEG-2 video and AAC, MP3, Opus, AC-3, FLAC, PCM audio. Multi-track audio lets you pick the language. |
| **Links that need a login** | Private or age-restricted pages: export a `cookies.txt` from the browser where you are logged in (see below). |

## Output

| | |
| --- | --- |
| Resolution | 1080 × 1920 (9:16) for landscape sources. Portrait and square sources keep their own frame, capped at 1920 tall. |
| Video | H.264 High profile, CRF quality presets, source frame rate (capped at 60), `+faststart` |
| Audio | AAC 192 kbps, 48 kHz stereo, loudness normalised to −14 LUFS / −1.5 dBTP |
| Per part | `Title - Part 01.mp4` … plus `captions.txt` and `manifest.json` |

## Use your own content

This tool is built for creators who cut their **own** long-form videos into short-form: podcasts, streams, tutorials, vlogs, talks, gameplay, lectures. That is what grows a channel.

Re-uploading other people's movies, shows or videos does not. Content ID catches it, the reused-content policy excludes it from monetisation, and repeated strikes remove channels. Only cut videos you made or have permission to use, and check each platform's rules before posting.

**A watermark does not make someone else's video yours.** The branding options exist to put your name
on your own work, not to disguise a re-upload. Content ID matches the picture and the audio, so a
title card, a handle in the corner or a colour tweak changes nothing about a copyright claim. If you
did not make the video and do not have permission, adding your logo makes the infringement easier to
attribute to you, not harder.

## Download

Grab the latest installer from the [Releases](../../releases) page:

| Platform | File |
| --- | --- |
| Windows 10/11 | `MovieToShort-<version>-win-x64.exe` |
| macOS (Apple Silicon) | `MovieToShort-<version>-mac-arm64.dmg` |
| macOS (Intel) | `MovieToShort-<version>-mac-x64.dmg` |
| Linux | `MovieToShort-<version>-linux-x86_64.AppImage` |

The builds are not code-signed. On macOS, the first launch needs a right-click → **Open**, or run `xattr -cr /Applications/MovieToShort.app` once. On Windows, click **More info → Run anyway** on the SmartScreen prompt.

Link downloads use yt-dlp, which the app downloads on first use into its data folder and can update from the UI (**Login required, age-restricted or private? → Update yt-dlp**). Sites change often; if a link stops working, update first.

### When a site asks you to log in

Some sites (YouTube in particular) show "sign in to confirm you're not a bot" on shared or data-centre networks, and private or age-restricted pages always need a login. The app first retries automatically through alternative player clients, which usually works. If it still fails:

1. Install the **Get cookies.txt LOCALLY** browser extension.
2. Open the site while logged in, click the extension, **Export**.
3. In the app, open **Login required, age-restricted or private?** and choose the exported file. It is remembered.

Reading cookies straight from Chrome or Edge rarely works on Windows any more (the browser must be closed and recent versions encrypt the database). Firefox does work. The `cookies.txt` route works everywhere.

## Why the output performs

The defaults come from what actually holds viewers on short-form platforms:

- **Safe zones.** Badges, titles and watermarks are placed where the platform UI (title, caption, like/share column) does not cover them. Toggle *Safe zones* in the preview to see the covered areas.
- **Even part lengths + smart cuts.** Silence detection (`ffmpeg silencedetect`) finds pauses; the planner spreads parts evenly and snaps each boundary to the best pause within a search window, preferring longer pauses (scene breaks) over short breaths.
- **Progress bar.** A thin bar along the bottom tells viewers the part is almost over, which reduces swipe-away on longer clips.
- **"Part N ▶" teaser.** Fades in during the last seconds of every part except the last one.
- **Blurred backdrop by default.** Widescreen content keeps the whole frame; *Zoom* crops a little from the sides to make the picture taller. *Fill* crops to full screen for talking heads; *Solid* pads on a colour.
- **Loudness normalised to −14 LUFS**, the level every platform targets, so no part is quieter than the next.
- **Optional GPU encoding** (NVENC, QuickSync, AMF, VideoToolbox) with automatic software fallback.

## Run from source

Requirements: [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/upworkprashantp/movietoshort.git
cd movietoshort
npm install          # also downloads ffmpeg/ffprobe for your platform
npm run dev          # start the app with hot reload
```

Other scripts:

```bash
npm test                 # unit tests (planner, parsers, helpers)
npm run test:integration # renders real clips with the bundled ffmpeg (no Electron needed)
npm run typecheck
npm run dist:win         # installer for Windows  -> dist/
npm run dist:mac         # dmg + zip for macOS    -> dist/
npm run dist:linux       # AppImage               -> dist/
```

**Run without installing (portable):** `npm run pack:win` (or `pack:mac`) writes a ready-to-run app to
`dist/win-unpacked/MovieToShort.exe` (`dist/mac-arm64/MovieToShort.app`). Make a Desktop shortcut to it and
you have a one-click launch. Rebuild after pulling new code.

On Windows, `dist:win` needs permission to create symbolic links (electron-builder unpacks its tooling with them).
Turn on **Settings → System → For developers → Developer Mode** once, or run the command from an administrator
terminal. The GitHub Actions workflow in `.github/workflows/build.yml` builds all platforms without any of this.

Smoke test the built app without clicking (used by CI):

```bash
npm run build
MOVIETOSHORT_SMOKE=shot.png MOVIETOSHORT_SMOKE_FILE=some.mp4 MOVIETOSHORT_SMOKE_RENDER=1 MOVIETOSHORT_SMOKE_OUT=./out npx electron .
MOVIETOSHORT_SMOKE=shot.png MOVIETOSHORT_SMOKE_MODE=highlights MOVIETOSHORT_SMOKE_FILE=long.mp4 MOVIETOSHORT_SMOKE_RENDER=1 npx electron .
# Combine: separate files with ; on Windows and : on macOS and Linux
MOVIETOSHORT_SMOKE=shot.png MOVIETOSHORT_SMOKE_MODE=combine MOVIETOSHORT_SMOKE_FILES="a.mp4;b.mp4" MOVIETOSHORT_SMOKE_RENDER=1 npx electron .
```

## How it works

```
src/
  shared/      types, planner (planParts), time helpers, encoder args   – pure, unit-tested
  main/        Electron main process
    probe.ts        ffprobe → SourceInfo (duration, size, SAR/rotation, audio tracks, thumbnail)
    ytdlp.ts        download/update yt-dlp, fetch info, download (cached per video id),
                    automatic retries (no cookies / alternative player clients)
    silence.ts      silencedetect pass over the audio, streamed progress
    filtergraph.ts  builds the -filter_complex for a part (layout, overlays, progress bar, audio)
    render.ts       renders every part sequentially, writes manifest.json + captions.txt
    encoders.ts     hardware encoder detection (real test encode)
    ipc.ts          IPC handlers, one cancellable job at a time
    compose.ts      Highlights and Combine: cut each piece to one frame and rate, join, then brand
  shared/output.ts  output frame size, safe zones (portrait sources keep their own frame)
  shared/highlights.ts  snippet planner and clip timeline, exact to the frame and the audio sample
  preload/     contextBridge API (window.api)
  renderer/    React UI. Overlays (badge, title, watermark, teaser) are drawn on a <canvas>
               at 1080×1920 and sent to ffmpeg as PNGs, so any font/style works on any OS.
```

Per part, ffmpeg runs once with input seeking (`-ss … -t …` before `-i`, frame accurate) and a single filter graph:

```
[0:v] setpts → (fps) → layout (blur | fill | solid) → badge → title → watermark → teaser → progress bar → yuv420p
[0:a] asetpts → loudnorm → 48 kHz stereo
```

The blurred backdrop is computed at quarter resolution and scaled back up, which is 16× cheaper and looks identical.

yt-dlp needs a JavaScript runtime (Node 22+) to unlock all formats on some sites. The app passes its own Electron binary as that runtime (`ELECTRON_RUN_AS_NODE=1`), so users never have to install anything.

## Roadmap

Contributions welcome. Things that would make this better, roughly in order:

- [ ] Auto captions (whisper.cpp) burned in with word highlighting
- [ ] Scene-change aware cuts in addition to silence
- [ ] Face/subject tracking for the *Fill* layout
- [ ] Batch queue: several videos in one go
- [ ] Direct upload to YouTube / Instagram / TikTok via their APIs
- [ ] Custom fonts and badge templates (JSON presets)

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. ffmpeg builds are provided by the [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) package under their respective licenses; yt-dlp is Unlicense; the Inter font is SIL OFL 1.1.

You are responsible for what you download and publish. Only cut and republish content you own or have permission to use.
