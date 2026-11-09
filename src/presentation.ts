import { isDictationPhase, phasePolicy, type DictationPhase } from './state.ts';
const phaseLabels: Record<DictationPhase, string> = { idle: 'Ready', copied: 'Copied', setup_required: 'Setup needed', not_pasted: 'Not pasted', recording: 'Listening', processing: 'Processing', downloading: 'Downloading', error: 'Needs attention' };
export function phaseLabel(phase: string): string {
  return isDictationPhase(phase) ? phaseLabels[phase] : 'Connecting';
}
export function canCancel(phase: string): boolean {
  return phasePolicy(phase).cancel;
}
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (safe < 60) return `${Math.floor(safe)} sec`;
  if (safe < 3600) return `${Math.floor(safe / 60)} min`;
  return `${(safe / 3600).toFixed(1)} hr`;
}
export function readiness(status: { platform?: string; model_ready: boolean; microphone: boolean; accessibility: boolean; input_monitoring: boolean; hotkey: boolean }): boolean {
  const platform = status.platform ?? 'macos'; // Older Mac status fixtures remain compatible.
  return status.model_ready && status.microphone && status.hotkey && (platform === 'windows' || (platform === 'macos' && status.accessibility && status.input_monitoring));
}
export function readinessDetail(status: Parameters<typeof readiness>[0]): string {
  if (status.platform === 'windows') {
    if (!status.microphone) return 'Connect a microphone and check microphone access in Windows Settings.';
    if (!status.hotkey) return 'Shortcut unavailable. Choose another shortcut in Settings.';
    if (!status.model_ready) return 'Download the English model to dictate offline.';
    return 'Ready to dictate.';
  }
  if (status.platform && status.platform !== 'macos') return 'Waiting for a supported native platform.';
  const missing = [!status.microphone && 'Microphone', !status.accessibility && 'Accessibility', !status.input_monitoring && 'Input Monitoring'].filter(Boolean);
  if (missing.length) return `Allow ${missing.join(', ')} in Settings.`;
  if (!status.hotkey) return 'Quit and reopen HandsFree to reconnect your shortcut.';
  if (!status.model_ready) return 'Download the English model to dictate offline.';
  return 'Ready to dictate.';
}
