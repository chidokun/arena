/** Cầu nối tới React `useSyncExternalStore`: tính lại view lười biếng, gộp nhiều thay đổi trong một microtask. */
export class ViewStore<V> {
  private fns = new Set<() => void>();
  private view: V | undefined;
  private dirty = true;
  private scheduled = false;
  private compute: () => V;

  constructor(compute: () => V) {
    this.compute = compute;
  }

  subscribe = (fn: () => void) => {
    this.fns.add(fn);
    return () => {
      this.fns.delete(fn);
    };
  };

  get = (): V => {
    if (this.dirty || this.view === undefined) {
      this.view = this.compute();
      this.dirty = false;
    }
    return this.view;
  };

  invalidate() {
    this.dirty = true;
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      for (const fn of this.fns) fn();
    });
  }
}
