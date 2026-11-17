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
function downloadProgress(view: UpdateView): string {
  const downloaded = Number.isFinite(view.downloaded_bytes) ? Math.max(0, view.downloaded_bytes) : 0;
  const total = Number.isFinite(view.total_bytes) && view.total_bytes! > 0 ? view.total_bytes : undefined;
  const bytes = (value: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit = Math.min(units.length - 1, Math.floor(Math.log10(Math.max(1, value)) / 3));
    return `${(value / 1000 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  };
  return total === undefined ? `${bytes(downloaded)} downloaded`
    : `${Math.min(100, Math.floor(downloaded / total * 100))}% · ${bytes(downloaded)} / ${bytes(total)}`;
}
export function updateIndicator(view: UpdateView): {label: string; detail: string; attention: 'available' | 'error' | 'none'} {
  switch (view.phase) {
    case 'available':
      return view.available_version
        ? {label: 'Download & update', detail: view.available_version, attention: 'available'}
        : {label: 'Updates', detail: 'Check for latest', attention: 'none'};
    case 'up_to_date': return {label: 'Up to date', detail: 'At last check', attention: 'none'};
    case 'checking': return {label: 'Checking…', detail: 'Release metadata', attention: 'none'};
    case 'downloading': return {label: 'Downloading…', detail: downloadProgress(view), attention: 'none'};
    case 'installing': return {label: 'Installing…', detail: 'HandsFree will reopen', attention: 'none'};
    case 'error': return {label: 'Retry update check', detail: 'Check again', attention: 'error'};
    default: return {label: 'Updates', detail: 'Not checked', attention: 'none'};
  }
}
export class Updates {
  view: UpdateView = { installed_version: '', phase: 'idle', notes: '', downloaded_bytes: 0, message: 'Choose Check for updates to contact the release server.' };
  private revision = 0;
  private pending = false;
  private installationPending = false;
  // Native installation starts with metadata validation, still rendered as
  // `checking`. That invoke already excludes private capture, unlike a feed check.
  get installing() { return this.installationPending; }
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
  // Navigation revokes pending intent, even if the same offer is shown again.
  cancelPreparation() { ++this.preparation; this.prepared = undefined; }
  // The visible offer click authorizes only that exact version, never a newer
  // offer discovered by the feed recheck or returned by the native installer.
  async download(version: string): Promise<void> {
    if (this.pending || this.view.phase !== 'available' || this.view.available_version !== version || !this.canInstall()) return;
    const preparedVersion = await this.prepareConfirmation();
    if (preparedVersion !== version) {
      this.prepared = undefined;
      return;
    }
    await this.install(version);
  }
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
    this.pending = true; this.installationPending = true; ++this.revision;
    this.view = { ...this.view, phase: 'checking', downloaded_bytes: 0, message: 'Validating the confirmed release before downloading…' }; this.render(this.view);
    try { this.accept(await this.invoke<UpdateView>('install_update', { version })); }
    catch (error) { this.error(error); }
    finally { this.pending = false; this.installationPending = false; this.render(this.view); }
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
