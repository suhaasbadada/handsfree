// This controller owns only ephemeral practice text. It never reads the normal
// transcript or uses storage, clipboard, telemetry, or native dictation toggles.
import type { PracticePhase } from './state.ts';
type Invoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;
type Result = { generation: number | null; phase: 'starting' | 'recording' | 'processing' | 'complete' | 'empty' | 'error' | 'cancelled'; text: string; input_level?: number | null };
export type PracticeView = { phase: PracticePhase; text: string; message: string; inputLevel: number | null };
let nextToken = Date.now() * 1000;
export class Practice {
  private token?: number;
  private generation?: number;
  private edited = false;
  private finishRequested = false;
  private polling = false;
  private cancelling?: number;
  private revision = 0;
  private invoke: Invoke;
  private render: (view: PracticeView) => void;
  private allowed: () => boolean;
  view: PracticeView = { phase: 'idle', text: '', message: '', inputLevel: null };
  constructor(invoke: Invoke, render: (view: PracticeView) => void, allowed: () => boolean) {
    this.invoke = invoke; this.render = render; this.allowed = allowed;
  }
  private show(phase: PracticePhase, message: string) {
    this.view = { ...this.view, phase, message, inputLevel: phase === 'recording' ? this.view.inputLevel : null }; this.render(this.view);
  }
  edit(text: string) { this.edited = true; this.view.text = text; }
  async start() {
    if (this.token !== undefined || this.cancelling !== undefined || !this.allowed()) return;
    this.revision++;
    const token = ++nextToken;
    this.token = token; this.generation = undefined; this.edited = false; this.finishRequested = false;
    this.show('starting', 'Starting practice…');
    try {
      const generation = await this.invoke<number>('practice_start', { token });
      if (this.token !== token) { await this.invoke('practice_cancel', { token }); return; }
      if (!this.allowed()) { await this.clear(); return; }
      this.generation = generation;
      this.show('recording', 'Speak now, then choose Finish.');
      if (this.finishRequested) await this.finish();
    } catch (error) {
      if (this.token !== token) return;
      this.token = undefined;
      this.show('error', String(error));
    }
  }
  async finish() {
    if (this.token !== undefined && this.view.phase === 'starting') { this.finishRequested = true; return; }
    const token = this.token, generation = this.generation;
    if (token === undefined || generation === undefined || this.view.phase !== 'recording') return;
    this.show('processing', 'Transcribing on this Mac…');
    try { await this.invoke('practice_finish', { token, generation }); }
    catch (error) {
      if (this.token !== token) return;
      await this.clearWithError(String(error));
    }
  }
  async clear() {
    const revision = ++this.revision;
    const token = this.token ?? this.cancelling;
    this.token = undefined; this.generation = undefined; this.edited = false; this.finishRequested = false;
    this.cancelling = token;
    this.view.text = ''; this.show(token === undefined ? 'idle' : 'cancelling', token === undefined ? '' : 'Cancelling practice…');
    if (token !== undefined) {
      try {
        await this.invoke('practice_cancel', { token });
        if (this.cancelling === token) { this.cancelling = undefined; this.show('idle', ''); }
      }
      catch { if (this.revision === revision) this.show('error', 'Could not confirm cancellation. Keep this window open and use Clear to retry.'); }
    }
  }
  private async clearWithError(message: string) {
    const clearing = this.clear();
    const revision = this.revision;
    await clearing;
    if (this.revision === revision) this.show('error', message);
  }
  async poll() {
    const token = this.token, generation = this.generation;
    if (token === undefined || generation === undefined || this.polling || !['recording', 'processing'].includes(this.view.phase)) return;
    this.polling = true;
    try {
      const result = await this.invoke<Result>('practice_status', { token });
      if (this.token !== token || this.generation !== generation) return;
      if (!this.allowed()) { await this.clear(); return; }
      if (!['starting','recording','processing','complete','empty','error','cancelled'].includes(result.phase)) { await this.clearWithError('Practice status is unknown. Please try again.'); return; }
      if (result.phase === 'cancelled') { await this.clear(); return; }
      if (result.generation !== generation) { this.view.inputLevel = null; this.render(this.view); return; }
      this.view.inputLevel = result.phase === 'recording' && this.view.phase === 'recording' && typeof result.input_level === 'number' && Number.isFinite(result.input_level) && result.input_level >= 0 && result.input_level <= 1 ? result.input_level : null;
      if (result.phase === 'complete') {
        if (!this.edited) this.view.text = result.text;
        this.show('complete', this.edited ? 'Practice complete. Your edits were kept; clear to try again.' : 'Practice complete. Nothing was pasted or saved. Clear to try again.');
      } else if (result.phase === 'empty' || result.phase === 'error') {
        this.show(result.phase, result.phase === 'empty' ? 'No speech detected. Clear and try again.' : 'Practice could not transcribe. Check your microphone, then clear and try again.');
      } else if (result.phase === 'processing') this.show('processing', 'Transcribing on this Mac…');
      else if (result.phase === 'recording' && this.view.phase === 'recording') this.show('recording', 'Speak now, then choose Finish.');
      else this.render(this.view);
    } catch {
      if (this.token === token) await this.clearWithError('Practice connection lost. Please try again.');
    } finally { this.polling = false; }
  }
}
