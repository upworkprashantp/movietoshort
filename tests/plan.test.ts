import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planParts, parseSilenceOutput, renderTemplate, safeFileName } from '../src/shared/plan'
import { parseTime, formatTime } from '../src/shared/time'

test('splits evenly without a stubby tail', () => {
  const parts = planParts({
    durationSec: 610,
    skipStartSec: 0,
    skipEndSec: 0,
    targetLengthSec: 120,
    maxLengthSec: 180,
    smartCut: false,
    searchWindowSec: 10
  })
  assert.equal(parts.length, 6)
  for (const p of parts) assert.ok(Math.abs(p.duration - 610 / 6) < 0.01)
  assert.equal(parts[0].start, 0)
  assert.equal(parts[5].end, 610)
})

test('respects skip start / end', () => {
  const parts = planParts({
    durationSec: 1000,
    skipStartSec: 60,
    skipEndSec: 40,
    targetLengthSec: 120,
    maxLengthSec: 180,
    smartCut: false,
    searchWindowSec: 10
  })
  assert.equal(parts[0].start, 60)
  assert.equal(parts[parts.length - 1].end, 960)
})

test('snaps to the best nearby silence', () => {
  const parts = planParts({
    durationSec: 240,
    skipStartSec: 0,
    skipEndSec: 0,
    targetLengthSec: 120,
    maxLengthSec: 180,
    smartCut: true,
    silences: [
      { start: 60, end: 61 }, // too far
      { start: 116, end: 117.5 }, // long pause 3.25s away
      { start: 122, end: 122.2 } // short blip 2.1s away
    ],
    searchWindowSec: 10
  })
  assert.equal(parts.length, 2)
  assert.equal(parts[0].end, 116.75)
  assert.equal(parts[0].snappedEnd, true)
  assert.equal(parts[1].snappedStart, true)
})

test('never exceeds the platform max', () => {
  const parts = planParts({
    durationSec: 400,
    skipStartSec: 0,
    skipEndSec: 0,
    targetLengthSec: 180,
    maxLengthSec: 180,
    smartCut: true,
    silences: [{ start: 195, end: 196 }],
    searchWindowSec: 30
  })
  for (const p of parts) assert.ok(p.duration <= 180.001)
})

test('empty range gives no parts', () => {
  assert.deepEqual(
    planParts({
      durationSec: 100,
      skipStartSec: 60,
      skipEndSec: 60,
      targetLengthSec: 60,
      maxLengthSec: 180,
      smartCut: false,
      searchWindowSec: 10
    }),
    []
  )
})

test('parses silencedetect output', () => {
  const text = `[silencedetect @ 0x1] silence_start: 12.5
[silencedetect @ 0x1] silence_end: 13.25 | silence_duration: 0.75
[silencedetect @ 0x1] silence_start: 40
[silencedetect @ 0x1] silence_end: 41 | silence_duration: 1`
  assert.deepEqual(parseSilenceOutput(text), [
    { start: 12.5, end: 13.25 },
    { start: 40, end: 41 }
  ])
})

test('time helpers', () => {
  assert.equal(parseTime('1:30'), 90)
  assert.equal(parseTime('90'), 90)
  assert.equal(parseTime('1:02:03'), 3723)
  assert.ok(Number.isNaN(parseTime('abc')))
  assert.equal(formatTime(90), '1:30')
  assert.equal(formatTime(3723), '1:02:03')
})

test('templates and file names', () => {
  assert.equal(renderTemplate('Part {n}/{total}', 3, 12), 'Part 3/12')
  assert.equal(safeFileName('Movie: The "Best"? <Ever> | 2024'), 'Movie- The -Best- -Ever- - 2024')
  assert.equal(safeFileName('   '), 'video')
})

test('cuts moving apart cannot exceed the hard limit', () => {
  const base = {
    durationSec: 540,
    skipStartSec: 0,
    skipEndSec: 0,
    targetLengthSec: 180,
    maxLengthSec: 180,
    smartCut: true,
    searchWindowSec: 30
  }
  // Ideal cuts at 180 and 360. A pause at 165 and one at 385 would give a 220 s middle part.
  const bad = planParts({ ...base, silences: [{ start: 164, end: 166 }, { start: 384, end: 386 }] })
  assert.equal(bad.length, 3)
  for (const p of bad) assert.ok(p.duration <= 180.001, `part ${p.index} is ${p.duration}s`)
  // Pauses that do fit are still used.
  const good = planParts({ ...base, silences: [{ start: 179, end: 181 }, { start: 359, end: 361 }] })
  assert.equal(good[0].end, 180)
  assert.equal(good[1].end, 360)
  assert.ok(good[0].snappedEnd && good[1].snappedEnd)
})
