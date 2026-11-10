export type LoginStatus = {status: 'enabled' | 'approval_required' | 'not_registered' | 'not_found' | 'unknown'; error: string | null};
export type WorkflowStatus = {paused: boolean; excluded_bundle_ids: string[]; login: LoginStatus};
export type RunningApp = {bundle_id: string; name: string};
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Field = 'pause' | 'exclusions' | 'login' | 'apps' | 'settings';
// Observation never grants native admission. Independent writes merge only
// their owned field; old snapshots cannot undo a newer user edit.
export class Workflow {
  status?: WorkflowStatus;
  apps: RunningApp[] = [];
  error = '';
  pending = {pause:false, exclusions:false, login:false, apps:false, settings:false};
  private revision = 0;
  private refreshing?: Promise<void>;
  private invoke: Invoke;
  private render: () => void;
  private allowed: () => boolean;
  constructor(invoke: Invoke, render: () => void, allowed: () => boolean) { this.invoke = invoke; this.render = render; this.allowed = allowed; }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (!this.allowed() || Object.values(this.pending).some(Boolean)) return Promise.resolve();
    const revision = this.revision;
    this.refreshing = this.invoke<WorkflowStatus>('workflow_status').then(status => {
      if (revision === this.revision) { this.status = status; this.render(); }
    }).catch(error => { if(revision === this.revision) { this.error = String(error); this.render(); } }).finally(() => {this.refreshing = undefined;});
    return this.refreshing;
  }
  private async change(field: Field, effect: () => Promise<void>) {
    if (!this.allowed() || this.pending[field] || (field !== 'apps' && !this.status)) return;
    ++this.revision; this.pending[field] = true; this.error = ''; this.render();
    try { await effect(); } catch(error) { this.error = String(error); }
    finally { ++this.revision; this.pending[field] = false; this.render(); }
  }
  pause(paused: boolean) { return this.change('pause', async () => { const result = await this.invoke<WorkflowStatus>('set_paused', {paused}); this.status = {...this.status!, paused: result.paused}; }); }
  exclusions(bundleIds: string[]) { return this.change('exclusions', async () => { const result = await this.invoke<WorkflowStatus>('set_excluded_apps', {bundleIds}); this.status = {...this.status!, excluded_bundle_ids: result.excluded_bundle_ids}; }); }
  login(enabled: boolean) { return this.change('login', async () => { const login = await this.invoke<LoginStatus>('set_launch_at_login', {enabled}); this.status = {...this.status!, login}; }); }
  openLoginSettings() { return this.change('settings', async () => { await this.invoke('open_login_settings'); }); }
  runningApps() { return this.change('apps', async () => { this.apps = await this.invoke<RunningApp[]>('running_apps'); }); }
}
