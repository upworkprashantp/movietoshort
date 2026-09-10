import { test } from 'node:test'
import assert from 'node:assert/strict'
import { outputSize, safeZones, sameAspect } from '../src/shared/output'
import { planParts } from '../src/shared/plan'

test('landscape sources become the vertical canvas', () => {
  const s = outputSize(1920, 1080, 'auto')
  assert.deepEqual([s.width, s.height, s.keptSource], [1080, 1920, false])
  assert.equal(s.uiScale, 1)
})

test('a reel keeps its own size', () => {
  const s = outputSize(1080, 1920, 'auto')
  assert.deepEqual([s.width, s.height, s.keptSource], [1080, 1920, true])
})

test('a 4:5 post keeps its shape', () => {
  const s = outputSize(1080, 1350, 'auto')
  assert.deepEqual([s.width, s.height, s.keptSource], [1080, 1350, true])
  assert.equal(s.uiScale, 1)
})

test('a small vertical clip keeps its size and scales the overlays down', () => {
  const s = outputSize(720, 1280, 'auto')
  assert.deepEqual([s.width, s.height], [720, 1280])
  assert.ok(Math.abs(s.uiScale - 720 / 1080) < 1e-9)
})

test('oversized vertical sources are capped, never upscaled past the limits', () => {
  const s = outputSize(2160, 3840, 'auto')
  assert.deepEqual([s.width, s.height], [1080, 1920])
  const square = outputSize(2000, 2000, 'auto')
  assert.ok(square.width <= 1440 && square.height <= 1920)
  assert.equal(square.width, square.height)
})

test('modes override the automatic choice', () => {
  assert.equal(outputSize(1080, 1920, 'vertical').keptSource, false)
  const kept = outputSize(1920, 1080, 'source')
  assert.equal(kept.keptSource, true)
  assert.deepEqual([kept.width, kept.height], [1440, 810])
})

test('every output frame gets usable safe zones', () => {
  for (const [w, h] of [
    [1080, 1920],
    [1080, 1350],
    [720, 1280],
    [1080, 1080]
  ]) {
    const size = outputSize(w, h, 'auto')
    const z = safeZones(size)
    assert.ok(z.top > 0 && z.bottom > 0, `${w}x${h} zones must be positive`)
    assert.ok(z.top + z.bottom < size.height * 0.5, `${w}x${h} zones must leave room for the picture`)
    assert.ok(z.side * 2 < size.width * 0.4, `${w}x${h} side margins must leave room`)
  }
})

test('sameAspect spots a frame that needs no re-framing', () => {
  assert.ok(sameAspect(1080, 1920, 1080, 1920))
  assert.ok(sameAspect(540, 960, 1080, 1920))
  assert.ok(!sameAspect(1920, 1080, 1080, 1920))
})

test('single clip mode returns the whole trimmed range', () => {
  const parts = planParts({
    durationSec: 600,
    skipStartSec: 30,
    skipEndSec: 20,
    targetLengthSec: 60,
    maxLengthSec: 180,
    smartCut: true,
    singleClip: true,
    silences: [{ start: 100, end: 102 }],
    searchWindowSec: 10
  })
  assert.equal(parts.length, 1)
  assert.deepEqual([parts[0].start, parts[0].end, parts[0].duration], [30, 580, 550])
})

test('a short video already plans as one part', () => {
  const parts = planParts({
    durationSec: 42,
    skipStartSec: 0,
    skipEndSec: 0,
    targetLengthSec: 120,
    maxLengthSec: 180,
    smartCut: false,
    searchWindowSec: 10
  })
  assert.equal(parts.length, 1)
})
