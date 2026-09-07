import React from 'react'
import type { BadgePosition, CropFocus, LabelSize, LabelStyle, Layout, Settings } from '@shared/types'
import { Card, ColorInput, Field, Segmented, Slider, Toggle } from './ui'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  disabled: boolean
  sourceTitle?: string
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
    <Card title="4. Look" subtitle="Vertical 9:16 layout, part badge and retention extras.">
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

      <Toggle checked={s.badgeEnabled} disabled={d} onChange={(v) => p.update({ badgeEnabled: v })} label="Part number badge" />
      {s.badgeEnabled && (
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

      <Toggle checked={s.teaserEnabled} disabled={d} onChange={(v) => p.update({ teaserEnabled: v })} label="“Part N ▶” teaser at the end" hint="Shown in the last seconds of every part except the final one." />
      {s.teaserEnabled && (
        <div className="indent">
          <Slider value={s.teaserSeconds} min={2} max={8} step={1} disabled={d} onChange={(v) => p.update({ teaserSeconds: v })} format={(v) => `${v}s`} />
        </div>
      )}
    </Card>
  )
}
