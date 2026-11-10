// Observation contracts, not a global state machine. Rust/native owners still
// authorize effects at their FIFO/lock boundaries. See docs/STATE-MACHINES.md.
export const dictationPhases = Object.freeze(['idle', 'setup_required', 'recording', 'processing', 'downloading', 'copied', 'not_pasted', 'error'] as const);
export type DictationPhase = typeof dictationPhases[number];
export const practicePhases = Object.freeze(['idle', 'starting', 'recording', 'processing', 'cancelling', 'complete', 'empty', 'error'] as const);
export type PracticePhase = typeof practicePhases[number];
export const updatePhases = Object.freeze(['idle', 'checking', 'available', 'up_to_date', 'downloading', 'installing', 'error'] as const);
export type UpdatePhase = typeof updatePhases[number];
export const isDictationPhase = (phase: unknown): phase is DictationPhase => typeof phase === 'string' && (dictationPhases as readonly string[]).includes(phase);
export const isUpdatePhase = (phase: unknown): phase is UpdatePhase => typeof phase === 'string' && (updatePhases as readonly string[]).includes(phase);

export type PhasePolicy = Readonly<{ editConfiguration: boolean; previewSound: boolean; cancel: boolean; installUpdate: boolean }>;
const policy = (editConfiguration: boolean, previewSound: boolean, cancel: boolean, installUpdate: boolean): PhasePolicy => Object.freeze({ editConfiguration, previewSound, cancel, installUpdate });
const blocked = policy(false, false, false, false);
const policies: Record<DictationPhase, PhasePolicy> = {
  idle: policy(true, true, false, true),
  setup_required: policy(true, false, false, true),
  recording: policy(false, false, true, false),
  processing: policy(false, false, true, false),
  downloading: blocked,
  copied: policy(true, true, false, true),
  not_pasted: policy(true, false, false, false),
  error: policy(true, false, false, true),
};
// This is only the phase part of eligibility, never a grant to perform an effect.
// Unknown/disconnected phases fail closed. Callers retain their domain guards.
export function phasePolicy(phase: unknown): PhasePolicy {
  return isDictationPhase(phase) ? policies[phase] : blocked;
}
export const updateInstalling = (phase: unknown) => phase === 'downloading' || phase === 'installing';
export const updatePhaseBusy = (phase: unknown) => phase === 'checking' || updateInstalling(phase);
// Within one revision, delayed download snapshots must not undo installation.
// Final errors/success come from the owning invoke, not progress polling.
export function acceptsUpdateProgress(current: UpdatePhase, reported: unknown): boolean {
  return current === 'checking' || current === 'downloading' ? updateInstalling(reported) : current === 'installing' && reported === 'installing';
}
