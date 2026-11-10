// Readiness is observation only; native commands still authorize every effect.
export type SetupStatus = { platform?: string; microphone?: boolean; accessibility?: boolean; input_monitoring?: boolean; hotkey?: boolean; model_ready?: boolean };
export function setupChecklist(status?: SetupStatus) {
  const mac = status?.platform === 'macos';
  return {
    microphone: mac && status.microphone === true,
    permissions: mac && status.accessibility === true && status.input_monitoring === true,
    shortcut: mac && status.hotkey === true,
    model: mac && status.model_ready === true,
  };
}
export function shortcutTutorial(label: string, mode?: string): string {
  if (mode === 'push_to_talk') return `Hold ${label} and speak; release to finish. Other keys or changing focus cancel the test.`;
  if (mode === 'toggle') return `Press ${label} and speak; press it again to finish. For Fn, use a short tap without other keys.`;
  return 'Waiting for the configured recording mode. Use Start test for a button-only check.';
}
