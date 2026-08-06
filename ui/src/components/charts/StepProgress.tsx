import { Check } from 'lucide-react'
import '@/styles/charts.css'

export interface Step {
  label: string
  done: boolean
}

interface StepProgressProps {
  steps: Step[]
}

/**
 * Horizontal step indicator for onboarding / enrollment progress.
 * The first not-done step is highlighted as "current". Safe on empty input.
 */
export function StepProgress({ steps }: StepProgressProps) {
  if (!steps || steps.length === 0) return null

  const currentIdx = steps.findIndex((s) => !s.done)

  return (
    <div className="step-progress" role="list" aria-label="Progres langkah">
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx
        const stateCls = step.done
          ? 'step-progress__step--done'
          : isCurrent
            ? 'step-progress__step--current'
            : ''
        const nodeCls = step.done
          ? 'step-progress__node--done'
          : isCurrent
            ? 'step-progress__node--current'
            : ''
        // Connector to the previous node is "done" when this step is done.
        const connectorDone = step.done
        return (
          <div key={step.label} className={`step-progress__step ${stateCls}`} role="listitem">
            {i > 0 && (
              <span
                className={`step-progress__connector ${connectorDone ? 'step-progress__connector--done' : ''}`}
                style={{ left: '-50%' }}
              />
            )}
            <span className={`step-progress__node ${nodeCls}`}>
              {step.done ? <Check size={16} strokeWidth={3} /> : i + 1}
            </span>
            <span className="step-progress__label">{step.label}</span>
          </div>
        )
      })}
    </div>
  )
}
