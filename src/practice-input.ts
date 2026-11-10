import type { Practice } from './practice.ts';
export type PracticeInput = {context: number; action: 'toggle' | 'press' | 'release' | 'cancel'; source: number; token: number};
// Input identity and UI context are not recording tokens. Early key releases
// survive a delayed start acknowledgement; stale focus contexts never restart.
export class PracticeInputs {
  private revision = 0;
  private preparing = false;
  private held?: {key: string; released: boolean};
  private practice: Practice;
  private allowed: () => boolean;
  constructor(practice: Practice, allowed: () => boolean) { this.practice = practice; this.allowed = allowed; }
  reset() { ++this.revision; this.preparing = false; this.held = undefined; }
  async start() { if(this.preparing || ['starting','recording','processing','cancelling'].includes(this.practice.view.phase)) return; return this.begin(); }
  private async begin(gesture?: {key: string; released: boolean}) {
    const revision = ++this.revision;
    this.preparing = true;
    try {
      if (['complete','empty','error'].includes(this.practice.view.phase)) await this.practice.clear();
      if (revision !== this.revision || !this.allowed()) return;
      await this.practice.start();
      if (revision === this.revision && gesture?.released && this.held === gesture) await this.practice.finish();
    } finally {
      if (revision === this.revision) {
        this.preparing = false;
        if (gesture?.released && this.held === gesture) this.held = undefined;
      }
    }
  }
  async receive(input: PracticeInput) {
    const key = `${input.source}:${input.token}`;
    if (input.action === 'release') {
      if (this.held?.key !== key) return;
      this.held.released = true;
      await this.practice.finish();
      if (!this.preparing) this.held = undefined;
      return;
    }
    if (input.action === 'cancel') {
      if (this.held?.key !== key) return;
      this.reset(); await this.practice.clear(); return;
    }
    if (!this.allowed()) return;
    const phase = this.practice.view.phase;
    if (input.action === 'toggle') {
      if (phase === 'recording' || phase === 'starting') { await this.practice.finish(); return; }
      if (this.preparing) { this.reset(); await this.practice.clear(); return; }
      if (phase === 'processing' || phase === 'cancelling') return;
      await this.begin();
    } else if (input.action === 'press') {
      if (this.held || this.preparing || ['starting','recording','processing','cancelling'].includes(phase)) return;
      const gesture = {key, released:false}; this.held = gesture;
      await this.begin(gesture);
    }
  }
}
