export function phaseLabel(phase: string): string {
  return ({ idle: 'Ready when you are', copied: 'Copied', setup_required: 'Setup needs attention', not_pasted: 'Not pasted · transcript saved', recording: 'Listening', processing: 'Finding your words', downloading: 'Downloading model', error: 'Needs attention' } as Record<string,string>)[phase] ?? 'Connecting';
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
  if (!status.input_monitoring) return 'Your shortcut is unavailable: allow this copy of HandsFree in System Settings → Privacy & Security → Input Monitoring, then quit and reopen it. After an update, remove and re-add /Applications/HandsFree.app if an old enabled entry no longer works.';
  if (!status.hotkey) return 'Your shortcut is disconnected despite Input Monitoring access. Quit and reopen /Applications/HandsFree.app. If it persists, remove and re-add that app in Input Monitoring.';
  if (!status.accessibility) return 'Accessibility access is unavailable. Enable this copy of HandsFree in Privacy & Security → Accessibility, then quit and reopen it. If already enabled after an update, remove and re-add /Applications/HandsFree.app.';
  if (!status.microphone) return 'Microphone access is unavailable. Click Allow in HandsFree Settings to request the macOS dialog. If previously denied, enable HandsFree in Privacy & Security → Microphone.';
  if (!status.model_ready) return 'Download the local English model in Settings before using your shortcut.';
  return 'Select a text field in another app. Your shortcut starts and finishes; Escape cancels.';
}
