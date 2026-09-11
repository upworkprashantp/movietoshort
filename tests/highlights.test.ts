import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combineTimeline, highlightsLength, planHighlights, quantize, segmentFps } from '../src/shared/highlights'
import { combineFrame } from '../src/shared/output'

const isWholeFrames = (sec: number, fps: number): boolean => Math.abs(sec * fps - Math.round(sec * fps)) < 1e-6

test('join frame rate snaps to a rate that divides 48 kHz', () => {
  assert.equal(segmentFps(29.97, 'source'), 30)
  assert.equal(segmentFps(23.976, 'source'), 24)
  assert.equal(segmentFps(59.94, 'source'), 60)
  assert.equal(segmentFps(120, 'source'), 60)
  assert.equal(segmentFps(25, 'source'), 25)
  assert.equal(segmentFps(0, 'source'), 30)
  assert.equal(segmentFps(24, '60'), 60)
  for (const r of [24, 25, 30, 60]) assert.equal(48000 % r, 0)
})

test('a 30 minute video becomes a 2 minute recap walking start to end', () => {
  const segs = planHighlights({ durationSec: 1800, skipStartSec: 0, skipEndSec: 0, targetSec: 120, clipSec: 2.5, fps: 30 })
  assert.equal(segs.length, 48)
  assert.equal(segs[0].start, 0)
  const last = segs[segs.length - 1]
  assert.ok(Math.abs(last.start + last.duration - 1800) < 1e-6, 'last snippet ends at the end of the video')
  assert.ok(Math.abs(highlightsLength(segs) - 120) < 1e-6)
  for (let i = 1; i < segs.length; i++) {
    assert.ok(segs[i].start >= segs[i - 1].start + segs[i - 1].duration, 'snippets never overlap')
    assert.ok(segs[i].start > segs[i - 1].start, 'snippets stay in order')
  }
})

test('skip start and end are respected', () => {
  const segs = planHighlights({ durationSec: 1800, skipStartSec: 60, skipEndSec: 120, targetSec: 60, clipSec: 2, fps: 30 })
  assert.equal(segs[0].start, 60)
  const last = segs[segs.length - 1]
  assert.ok(last.start + last.duration <= 1680 + 1e-6)
})

test('snippet lengths are frame exact even when the clip length is not', () => {
  const segs = planHighlights({ durationSec: 900, skipStartSec: 0, skipEndSec: 0, targetSec: 90, clipSec: 2.5, fps: 25 })
  assert.ok(segs.length > 0)
  for (const s of segs) {
    assert.ok(isWholeFrames(s.duration, 25), `duration ${s.duration} is whole frames`)
    assert.ok(isWholeFrames(s.at, 25), `position ${s.at} is whole frames`)
  }
  assert.ok(isWholeFrames(highlightsLength(segs), 25))
})

test('a video already shorter than the target is used whole', () => {
  const segs = planHighlights({ durationSec: 75.4, skipStartSec: 0, skipEndSec: 0, targetSec: 120, clipSec: 2.5, fps: 30 })
  assert.equal(segs.length, 1)
  assert.equal(segs[0].start, 0)
  assert.equal(segs[0].duration, quantize(75.4, 30, 'floor'))
})

test('nothing to plan when the trimmed range is empty', () => {
  assert.deepEqual(planHighlights({ durationSec: 100, skipStartSec: 60, skipEndSec: 60, targetSec: 60, clipSec: 2, fps: 30 }), [])
})

test('clips are laid end to end, frame exact, tiny ones dropped', () => {
  const { items, total } = combineTimeline([10.02, 5, 0.01, 7.5], 30)
  assert.deepEqual(
    items.map((i) => i.index),
    [0, 1, 3]
  )
  assert.equal(items[0].at, 0)
  assert.equal(items[1].at, 10)
  assert.equal(items[2].at, 15)
  assert.equal(total, 22.5)
  for (const it of items) assert.ok(isWholeFrames(it.duration, 30))
})

test('combined frame keeps a shared upright shape, otherwise uses the vertical canvas', () => {
  const reels = combineFrame(
    [
      { width: 1080, height: 1920 },
      { width: 720, height: 1280 }
    ],
    'auto'
  )
  assert.deepEqual([reels.width, reels.height, reels.keptSource], [1080, 1920, true])

  const mixed = combineFrame(
    [
      { width: 1080, height: 1920 },
      { width: 1920, height: 1080 }
    ],
    'auto'
  )
  assert.deepEqual([mixed.width, mixed.height], [1080, 1920])

  const squares = combineFrame(
    [
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 }
    ],
    'auto'
  )
  assert.deepEqual([squares.width, squares.height], [1080, 1920], 'different upright shapes share the vertical canvas')

  assert.deepEqual([combineFrame([], 'auto').width, combineFrame([], 'auto').height], [1080, 1920])
})
