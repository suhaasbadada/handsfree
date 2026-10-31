export function phaseLabel(phase: string): string {
  return ({ idle: 'Ready', copied: 'Copied', setup_required: 'Setup needs attention', not_pasted: 'Not pasted · transcript saved', recording: 'Listening', processing: 'Finding your words', downloading: 'Downloading model', error: 'Needs attention' } as Record<string,string>)[phase] ?? 'Connecting';
}
export function canCancel(phase: string): boolean {
  return ['recording', 'processing'].includes(phase);
}
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (safe < 60) return `${Math.floor(safe)} sec`;
  if (safe < 3600) return `${Math.floor(safe / 60)} min`;
  return `${(safe / 3600).toFixed(1)} hr`;
}
export function readiness(status: { model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean }): boolean {
  return status.model_ready && status.microphone && status.accessibility && status.input_monitoring && status.hotkey;
}
export function readinessDetail(status: Parameters<typeof readiness>[0]): string {
  const missing = [!status.microphone && 'Microphone', !status.accessibility && 'Accessibility', !status.input_monitoring && 'Input Monitoring'].filter(Boolean);
  if (missing.length) return `Allow ${missing.join(', ')} in Settings.`;
  if (!status.hotkey) return 'Quit and reopen HandsFree to reconnect your shortcut.';
  if (!status.model_ready) return 'Download the English model to dictate offline.';
  return 'Ready to dictate.';
}
