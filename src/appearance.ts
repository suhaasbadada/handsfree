export type Appearance = 'system' | 'light' | 'dark';
export function appearanceValue(value: unknown): Appearance {
  return value === 'light' || value === 'dark' ? value : 'system';
}
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
// A presentation owner, independent of practice, permissions and other edits.
export class AppearancePreference {
  value: Appearance = 'system';
  selection: Appearance = 'system';
  pending = false;
  error = '';
  revision = 0;
  private invoke: Invoke;
  private render: () => void;
  constructor(invoke: Invoke, render: () => void) { this.invoke = invoke; this.render = render; }
  observe(value: unknown, revision: number) {
    if (this.pending || revision !== this.revision) return;
    this.value = this.selection = appearanceValue(value);
    this.render();
  }
  async change(value: Appearance) {
    if (this.pending || value === this.value) { this.render(); return; }
    ++this.revision;
    this.pending = true; this.selection = value; this.error = ''; this.render();
    try { this.value = appearanceValue((await this.invoke<{appearance: Appearance}>('set_appearance', {appearance: value})).appearance); }
    catch (error) {
      this.error = String(error);
      // A durability failure may occur after rename. Observe the native/disk
      // reconciliation instead of pretending the former preference won.
      try { this.value = appearanceValue((await this.invoke<{appearance?: unknown}>('status')).appearance); }
      catch { /* Keep the last observed preference when disconnected. */ }
    } finally {
      ++this.revision; this.pending = false; this.selection = this.value; this.render();
    }
  }
}
