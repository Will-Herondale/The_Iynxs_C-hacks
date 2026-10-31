import { useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Button } from '@setu/ui';
import './wizard.css';

/** Step state for a multi-step form. All steps stay mounted (hidden), so field state and validation are unchanged. */
export function useWizard(count: number, initial = 0) {
  const [step, setStep] = useState(initial);
  const clamp = (n: number) => Math.max(0, Math.min(count - 1, n));
  return {
    step,
    count,
    last: step === count - 1,
    go: (n: number) => setStep(clamp(n)),
    next: () => setStep((s) => clamp(s + 1)),
    back: () => setStep((s) => clamp(s - 1)),
  };
}
export type Wizard = ReturnType<typeof useWizard>;

export function WizardProgress({ steps, wizard }: { steps: string[]; wizard: Wizard }) {
  const pct = ((wizard.step + 1) / wizard.count) * 100;
  return (
    <nav aria-label="Form steps" className="wizard-progress" data-testid="wizard-progress">
      <p className="wizard-progress__label" data-testid="wizard-step-label">
        Step {wizard.step + 1} of {wizard.count}: <strong>{steps[wizard.step]}</strong>
      </p>
      <ol className="wizard-progress__dots">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              className="wizard-progress__dot"
              aria-label={`Go to step ${i + 1}: ${s}`}
              aria-current={i === wizard.step ? 'step' : undefined}
              data-done={i < wizard.step ? 'true' : 'false'}
              onClick={() => wizard.go(i)}
            >
              {i < wizard.step ? '✓' : i + 1}
            </button>
          </li>
        ))}
      </ol>
      <div
        className="wizard-progress__bar"
        role="progressbar"
        aria-label="Form progress"
        aria-valuemin={1}
        aria-valuemax={wizard.count}
        aria-valuenow={wizard.step + 1}
        style={{ '--wizard-pct': `${pct}%` } as CSSProperties}
      />
    </nav>
  );
}

/** Back / Next, plus the form's submit button (children), which is only shown on the last step. */
export function WizardNav({ wizard, children }: { wizard: Wizard; children: ReactNode }) {
  return (
    <div className="wizard-nav">
      {wizard.step > 0 && (
        <Button className="wizard-nav__btn" data-testid="wizard-back" onClick={wizard.back}>
          ← Back
        </Button>
      )}
      {!wizard.last && (
        <Button variant="primary" className="wizard-nav__btn" data-testid="wizard-next" onClick={wizard.next}>
          Next →
        </Button>
      )}
      {children}
    </div>
  );
}

/** Enter in a text field moves to the next step instead of submitting early. */
export const advanceOnEnter = (wizard: Wizard) => (e: KeyboardEvent<HTMLFormElement>) => {
  if (e.key !== 'Enter' || wizard.last) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT') {
    e.preventDefault();
    wizard.next();
  }
};
