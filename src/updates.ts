export type UpdateView = {
  installed_version: string;
  phase: 'idle' | 'checking' | 'available' | 'up_to_date' | 'downloading' | 'installing' | 'error';
  available_version?: string;
  notes: string;
  downloaded_bytes: number;
  total_bytes?: number;
  message: string;
};
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export const updateBusy = (view: UpdateView) => ['checking', 'downloading', 'installing'].includes(view.phase);
export class Updates {
  view: UpdateView = { installed_version: '', phase: 'idle', notes: '', downloaded_bytes: 0, message: 'Choose Check for updates to contact the release server.' };
  private revision = 0;
  private pending = false;
  private polling = false;
  private invoke: Invoke;
  private render: (view: UpdateView) => void;
  private canInstall: () => boolean;
  constructor(invoke: Invoke, render: (view: UpdateView) => void, canInstall: () => boolean) {
    this.invoke = invoke; this.render = render; this.canInstall = canInstall;
  }
  private accept(view: UpdateView) {
    if (!view || typeof view.installed_version !== 'string' || typeof view.phase !== 'string') throw new Error('Update status is unavailable. Reopen this window to retry.');
    this.view = view; this.render(view);
  }
  private error(error: unknown) {
    this.view = { ...this.view, phase: 'error', message: String(error) }; this.render(this.view);
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
    this.pending = true; ++this.revision;
    this.view = { ...this.view, phase: 'checking', available_version: undefined, notes: '', message: 'Checking for updates…' }; this.render(this.view);
    try { this.accept(await this.invoke<UpdateView>('check_for_updates')); }
    catch (error) { this.error(error); }
    finally { this.pending = false; }
  }
  async install(version: string) {
    if (this.pending || this.view.phase !== 'available' || this.view.available_version !== version || !this.canInstall()) return;
    this.pending = true; ++this.revision;
    this.view = { ...this.view, phase: 'downloading', downloaded_bytes: 0, message: 'Starting the signed update…' }; this.render(this.view);
    try { this.accept(await this.invoke<UpdateView>('install_update', { version })); }
    catch (error) { this.error(error); }
    finally { this.pending = false; }
  }
  // Only local status IPC is polled while a download is running, never the feed.
  async progress() {
    if (!this.pending || !['downloading', 'installing'].includes(this.view.phase) || this.polling) return;
    const revision = this.revision;
    this.polling = true;
    try {
      const view = await this.invoke<UpdateView>('update_status');
      if (revision === this.revision && this.pending && ['downloading', 'installing'].includes(view?.phase)) this.accept(view);
    } catch { /* The active invoke reports a final failure; a missed poll must not re-enable installation. */ }
    finally { this.polling = false; }
  }
}
