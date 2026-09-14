import { passwordStrength } from '@/models/passwordStrength'

const SEGMENT_TONE = ['bg-error', 'bg-error', 'bg-tertiary', 'bg-primary', 'bg-primary']
const LABEL_TONE = [
  'text-error',
  'text-error',
  'text-tertiary',
  'text-primary',
  'text-primary',
]

type StrengthMeterProps = {
  password: string
  className?: string
}

export default function StrengthMeter({ password, className = '' }: StrengthMeterProps) {
  const { score, label } = passwordStrength(password)
  const filled = password ? Math.max(score, 1) : 0

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-[3px] flex-1 ${segment < filled ? SEGMENT_TONE[score] : 'bg-outline-variant'}`}
          />
        ))}
      </span>
      <span
        className={`font-label-caps text-label-caps uppercase ${
          password ? LABEL_TONE[score] : 'text-on-surface-variant'
        }`}
      >
        {password ? label : 'no password'}
      </span>
    </div>
  )
}
