export function phaseLabel(phase: string): string {
  return ({ idle: 'Ready when you are', recording: 'Listening', processing: 'Finding your words', downloading: 'Downloading model', error: 'Needs attention' } as Record<string,string>)[phase] ?? 'Connecting';
}
export function canCancel(phase: string): boolean {
  return ['recording', 'processing'].includes(phase);
}
