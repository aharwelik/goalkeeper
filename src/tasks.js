// tasks.js - Minimal priority task queue for the agent loop.
//
// Deliberately tiny: the 2026 lesson from Claude Code / Manus is that simpler
// beats elaborate planners. This just keeps an ordered backlog the agent can
// push to and pull from.
//
// Author: Anthony Harwelik <aharwelik@gmail.com>  License: MIT

export class TaskQueue {
  constructor(initial = []) {
    this._items = [];
    this._seq = 0;
    for (const t of initial) this.add(t);
  }

  add(task, priority = 0) {
    const item = { id: ++this._seq, task: String(task), priority, done: false };
    this._items.push(item);
    this._items.sort((a, b) => b.priority - a.priority || a.id - b.id);
    return item.id;
  }

  next() { return this._items.find(i => !i.done) || null; }

  complete(id) {
    const it = this._items.find(i => i.id === id);
    if (it) it.done = true;
    return !!it;
  }

  get pending() { return this._items.filter(i => !i.done).length; }
  get size() { return this._items.length; }
  list() { return this._items.map(i => ({ ...i })); }
}
