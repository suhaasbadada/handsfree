import { isUpdatePhase, updatePhaseBusy, acceptsUpdateProgress, type UpdatePhase } from './state.ts';
export type UpdateView = {
  installed_version: string;
  phase: UpdatePhase;
  available_version?: string;
  notes: string;
  downloaded_bytes: number;
  total_bytes?: number;
  message: string;
};
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export const updateBusy = (view: UpdateView) => updatePhaseBusy(view.phase);
export class Updates {
  view: UpdateView = { installed_version: '', phase: 'idle', notes: '', downloaded_bytes: 0, message: 'Choose Check for updates to contact the release server.' };
  private revision = 0;
  private pending = false;
  private polling = false;
  private preparation = 0;
  private prepared?: { version: string; revision: number };
  private invoke: Invoke;
  private render: (view: UpdateView) => void;
  private canInstall: () => boolean;
  constructor(invoke: Invoke, render: (view: UpdateView) => void, canInstall: () => boolean) {
    this.invoke = invoke; this.render = render; this.canInstall = canInstall;
  }
  private accept(view: UpdateView) {
    if (!view || typeof view.installed_version !== 'string' || !isUpdatePhase(view.phase) || (view.phase === 'available' && (typeof view.available_version !== 'string' || !view.available_version))) throw new Error('Update status is unavailable. Choose Check for updates to retry.');
    if (view.phase !== 'available' || view.available_version !== this.prepared?.version) this.prepared = undefined;
    this.view = view; this.render(view);
  }
  private error(error: unknown) {
    this.prepared = undefined;
    this.view = { ...this.view, phase: 'error', available_version: undefined, notes: '', downloaded_bytes: 0, total_bytes: undefined, message: String(error) }; this.render(this.view);
  }
  async refresh() {
    if (this.pending || this.polling) return;
    const revision = this.revision;
    this.polling = true;
    try {
      const view = await this.invoke<UpdateView>('update_status');
      if (revision === this.revision) this.accept(view);
    } catch (error) { if (revision === this.revision) this.error(error); }
    finally { this.polling = false; }
  }
  async check() {
    if (this.pending || updateBusy(this.view)) return;
    this.prepared = undefined;
    this.pending = true; ++this.revision;
    this.view = { ...this.view, phase: 'checking', available_version: undefined, notes: '', message: 'Checking for updates…' }; this.render(this.view);
    try { this.accept(await this.invoke<UpdateView>('check_for_updates')); }
    catch (error) { this.error(error); }
    finally { this.pending = false; }
  }
  // Explicit Download intent authorizes a feed refresh, not archive bytes.
  // Closing/navigation revokes the callback, even if the same dialog reopens.
  cancelPreparation() { ++this.preparation; this.prepared = undefined; }
  async prepareConfirmation(): Promise<string | undefined> {
    if (this.pending || this.view.phase !== 'available' || !this.canInstall()) return;
    const preparation = ++this.preparation;
    const revision = this.revision + 1;
    await this.check();
    if (preparation !== this.preparation || revision !== this.revision || this.view.phase !== 'available' || !this.canInstall()) return;
    const version = this.view.available_version!;
    this.prepared = { version, revision };
    return version;
  }
  async install(version: string) {
    if (this.pending || this.view.phase !== 'available' || this.view.available_version !== version || this.prepared?.version !== version || this.prepared.revision !== this.revision || !this.canInstall()) return;
    this.prepared = undefined;
    this.pending = true; ++this.revision;
    this.view = { ...this.view, phase: 'checking', downloaded_bytes: 0, message: 'Validating the confirmed release before downloading…' }; this.render(this.view);
    try { this.accept(await this.invoke<UpdateView>('install_update', { version })); }
    catch (error) { this.error(error); }
    finally { this.pending = false; }
  }
  // Only local status IPC is polled during an owned operation, never the feed.
  async progress() {
    if (!this.pending || !['checking', 'downloading', 'installing'].includes(this.view.phase) || this.polling) return;
    const revision = this.revision;
    this.polling = true;
    try {
      const view = await this.invoke<UpdateView>('update_status');
      if (revision === this.revision && this.pending && acceptsUpdateProgress(this.view.phase, view?.phase)) this.accept(view);
    } catch { /* The active invoke reports a final failure; a missed poll must not re-enable installation. */ }
    finally { this.polling = false; }
  }
}
