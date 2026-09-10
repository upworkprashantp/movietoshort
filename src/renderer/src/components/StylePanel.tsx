import React from 'react'
import type { BadgePosition, CropFocus, LabelSize, LabelStyle, Layout, Settings, SizeMode } from '@shared/types'
import type { OutputSize } from '@shared/output'
import { Card, ColorInput, Field, Pill, Segmented, Slider, Toggle } from './ui'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  disabled: boolean
  sourceTitle?: string
  /** The frame the current source will be rendered into, or null when nothing is loaded. */
  frame: OutputSize | null
  /** True when the export is one clip rather than numbered parts. */
  single: boolean
}

const POSITIONS: Array<{ value: BadgePosition; label: string }> = [
  { value: 'top-left', label: '↖' },
  { value: 'top-center', label: '↑' },
  { value: 'top-right', label: '↗' },
  { value: 'bottom-left', label: '↙' },
  { value: 'bottom-center', label: '↓' },
  { value: 'bottom-right', label: '↘' }
]

export function StylePanel(p: Props): JSX.Element {
  const s = p.settings
  const d = p.disabled
  return (
    <Card
      title="4. Look"
      subtitle="Frame, badges and retention extras."
      right={
        p.frame ? (
          <Pill tone={p.frame.keptSource ? 'ok' : 'muted'}>
            {p.frame.width}×{p.frame.height}
            {p.frame.keptSource ? ' · kept' : ''}
          </Pill>
        ) : undefined
      }
    >
      <Field
        label="Output size"
        hint={
          p.frame?.keptSource
            ? 'This video is already upright, so it is exported at its own size.'
            : 'Landscape video is re-framed to the vertical 1080×1920 canvas.'
        }
      >
        <Segmented<SizeMode>
          value={s.sizeMode}
          disabled={d}
          onChange={(v) => p.update({ sizeMode: v })}
          options={[
            { value: 'auto', label: 'Auto', title: 'Keep upright videos as they are, convert landscape to 9:16' },
            { value: 'vertical', label: '1080×1920', title: 'Always output the full vertical canvas' },
            { value: 'source', label: 'Keep source', title: 'Never re-frame, always keep the original shape' }
          ]}
        />
      </Field>

      <Field label="Layout">
        <Segmented<Layout>
          value={s.layout}
          disabled={d}
          onChange={(v) => p.update({ layout: v })}
          options={[
            { value: 'blur', label: 'Blur background', title: 'Movie/TV: full frame with a blurred backdrop' },
            { value: 'fill', label: 'Fill', title: 'Crop to fill the screen (talking heads, gameplay)' },
            { value: 'solid', label: 'Solid', title: 'Full frame on a solid colour' }
          ]}
        />
      </Field>
      {p.frame?.keptSource && (
        <p className="muted small">
          The picture already fills this frame, so the layout below only applies if you switch the output size.
        </p>
      )}
      {s.layout === 'fill' ? (
        <Field label="Keep" hint="which side of the wide frame to keep">
          <Segmented<CropFocus>
            value={s.cropFocus}
            disabled={d}
            onChange={(v) => p.update({ cropFocus: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' }
            ]}
          />
        </Field>
      ) : (
        <>
          <Field label="Zoom" hint="crops the sides a little to make the picture taller">
            <Slider value={s.fgScale} min={1} max={1.6} step={0.05} disabled={d} onChange={(v) => p.update({ fgScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </Field>
          {s.layout === 'blur' ? (
            <Field label="Blur strength">
              <Slider value={s.blurStrength} min={0} max={100} step={5} disabled={d} onChange={(v) => p.update({ blurStrength: v })} format={(v) => `${v}%`} />
            </Field>
          ) : (
            <Field label="Background colour" inline>
              <ColorInput value={s.padColor} disabled={d} onChange={(v) => p.update({ padColor: v })} />
            </Field>
          )}
        </>
      )}

      <hr />

      <Toggle
        checked={s.badgeEnabled}
        disabled={d || p.single}
        onChange={(v) => p.update({ badgeEnabled: v })}
        label="Part number badge"
        hint={p.single ? 'Not used: a single clip has no part number.' : undefined}
      />
      {s.badgeEnabled && !p.single && (
        <div className="indent">
          <div className="grid-2">
            <Field label="Text" hint="{n} = part, {total} = count">
              <input className="input" value={s.badgeTemplate} disabled={d} onChange={(e) => p.update({ badgeTemplate: e.target.value })} />
            </Field>
            <Field label="Position">
              <Segmented<BadgePosition> value={s.badgePosition} disabled={d} onChange={(v) => p.update({ badgePosition: v })} options={POSITIONS} />
            </Field>
          </div>
          <div className="stack">
            <Field label="Style">
              <Segmented<LabelStyle>
                value={s.badgeStyle}
                disabled={d}
                onChange={(v) => p.update({ badgeStyle: v })}
                options={[
                  { value: 'pill', label: 'Pill' },
                  { value: 'outline', label: 'Outline' },
                  { value: 'shadow', label: 'Shadow' }
                ]}
              />
            </Field>
            <Field label="Size">
              <Segmented<LabelSize>
                value={s.badgeSize}
                disabled={d}
                onChange={(v) => p.update({ badgeSize: v })}
                options={[
                  { value: 'small', label: 'S' },
                  { value: 'medium', label: 'M' },
                  { value: 'large', label: 'L' }
                ]}
              />
            </Field>
          </div>
          <Field label="Accent colour" inline>
            <ColorInput value={s.badgeAccent} disabled={d} onChange={(v) => p.update({ badgeAccent: v, progressBarColor: v })} />
          </Field>
        </div>
      )}

      <Toggle checked={s.titleEnabled} disabled={d} onChange={(v) => p.update({ titleEnabled: v })} label="Title at the top" hint="A hook line. Defaults to the video title." />
      {s.titleEnabled && (
        <div className="indent">
          <input className="input" value={s.titleText} placeholder={p.sourceTitle ?? 'Video title'} disabled={d} onChange={(e) => p.update({ titleText: e.target.value })} />
        </div>
      )}

      <Toggle checked={s.watermarkEnabled} disabled={d} onChange={(v) => p.update({ watermarkEnabled: v })} label="Channel watermark" hint="Small handle above the caption area." />
      {s.watermarkEnabled && (
        <div className="indent">
          <input className="input" value={s.watermarkText} disabled={d} onChange={(e) => p.update({ watermarkText: e.target.value })} />
        </div>
      )}

      <Toggle checked={s.progressBarEnabled} disabled={d} onChange={(v) => p.update({ progressBarEnabled: v })} label="Progress bar" hint="Thin bar along the bottom edge. Viewers stay when they can see the end coming." />
      {s.progressBarEnabled && (
        <div className="indent">
          <Field label="Colour" inline>
            <ColorInput value={s.progressBarColor} disabled={d} onChange={(v) => p.update({ progressBarColor: v })} />
          </Field>
        </div>
      )}

      <hr />

      <Toggle
        checked={s.introEnabled}
        disabled={d || s.titleEnabled}
        onChange={(v) => p.update({ introEnabled: v })}
        label="Intro title"
        hint={
          s.titleEnabled
            ? 'Turned off while “Title at the top” is on, they would sit in the same place.'
            : 'Slides in over the first seconds, then fades. Defaults to the video title.'
        }
      />
      {s.introEnabled && !s.titleEnabled && (
        <div className="indent">
          <input
            className="input"
            value={s.introText}
            placeholder={p.sourceTitle ?? 'Video title'}
            disabled={d}
            onChange={(e) => p.update({ introText: e.target.value })}
          />
          <Field label="On screen for">
            <Slider value={s.introSeconds} min={1} max={8} step={1} disabled={d} onChange={(v) => p.update({ introSeconds: v })} format={(v) => `${v}s`} />
          </Field>
        </div>
      )}

      <Toggle
        checked={s.ctaEnabled}
        disabled={d}
        onChange={(v) => p.update({ ctaEnabled: v })}
        label="Call to action at the end"
        hint="Fades in at the end. On numbered parts the “Part N ▶” teaser is used instead."
      />
      {s.ctaEnabled && (
        <div className="indent">
          <input className="input" value={s.ctaText} disabled={d} onChange={(e) => p.update({ ctaText: e.target.value })} />
          <Field label="On screen for">
            <Slider value={s.ctaSeconds} min={1} max={8} step={1} disabled={d} onChange={(v) => p.update({ ctaSeconds: v })} format={(v) => `${v}s`} />
          </Field>
        </div>
      )}

      <Toggle
        checked={s.teaserEnabled}
        disabled={d || p.single}
        onChange={(v) => p.update({ teaserEnabled: v })}
        label="“Part N ▶” teaser at the end"
        hint={p.single ? 'Not used: this export is a single clip.' : 'Shown in the last seconds of every part except the final one.'}
      />
      {s.teaserEnabled && !p.single && (
        <div className="indent">
          <Slider value={s.teaserSeconds} min={2} max={8} step={1} disabled={d} onChange={(v) => p.update({ teaserSeconds: v })} format={(v) => `${v}s`} />
        </div>
      )}
    </Card>
  )
}
