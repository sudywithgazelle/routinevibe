/* Dependency-free smoke test for the four game renderers. */
const fs = require('fs');
const vm = require('vm');

class ClassList {
  constructor(el) { this.el = el; }
  values() { return new Set((this.el.className || '').split(/\s+/).filter(Boolean)); }
  add(...names) { const s = this.values(); names.forEach(n => s.add(n)); this.el.className = [...s].join(' '); }
  remove(...names) { const s = this.values(); names.forEach(n => s.delete(n)); this.el.className = [...s].join(' '); }
  toggle(name, force) { const s = this.values(); const next = force === undefined ? !s.has(name) : !!force; next ? s.add(name) : s.delete(name); this.el.className = [...s].join(' '); return next; }
  contains(name) { return this.values().has(name); }
}
class Element {
  constructor(tag) { Object.assign(this, { tagName: tag.toUpperCase(), children: [], parentElement: null, className: '', style: {}, dataset: {}, attrs: {}, hidden: false, text: '' }); this.classList = new ClassList(this); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  append(...items) { for (const item of items) { if (item == null) continue; if (typeof item === 'string' || typeof item === 'number') { const node = new Element('#text'); node.text = String(item); this.append(node); } else { this.children.push(item); item.parentElement = this; } } }
  prepend(...items) { for (let i = items.length - 1; i >= 0; i--) { this.children.unshift(items[i]); items[i].parentElement = this; } }
  appendChild(item) { this.append(item); return item; }
  replaceChildren(...items) { this.children = []; this.text = ''; this.append(...items); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  find(predicate) { for (const child of this.children) { if (predicate(child)) return child; const nested = child.find?.(predicate); if (nested) return nested; } return null; }
  all() { let result = []; for (const child of this.children) result = result.concat(child, child.all?.() || []); return result; }
  querySelector(selector) { if (selector.startsWith('.')) return this.find(node => node.classList?.contains(selector.slice(1))) || null; return null; }
  querySelectorAll(selector) { if (selector === '.cross-clues button') return this.all().filter(node => node.tagName === 'BUTTON' && node.parentElement?.parentElement?.classList?.contains('cross-clues')); return []; }
  insertBefore(node, reference) { const index = this.children.indexOf(reference); if (index < 0) this.append(node); else { this.children.splice(index, 0, node); node.parentElement = this; } }
  closest(selector) { if (selector === '.game-inner') for (let node = this; node; node = node.parentElement) if (node.classList?.contains('game-inner')) return node; return null; }
}

const ids = { gameMessage: new Element('p'), gameBody: new Element('div'), gameModal: new Element('div') };
ids.gameModal.hidden = false;
const document = { createElement: tag => new Element(tag), getElementById: id => ids[id], addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; } };
const window = { GazelleApp: { gameDone() {} } };
const context = { window, document, performance: { now: () => 1000 }, setTimeout, clearTimeout, Math, console };
const source = process.argv[2] || require('path').join(__dirname, '..', 'games.js');
vm.runInNewContext(fs.readFileSync(source, 'utf8'), context);

for (const [game, className, expected] of [
  ['memory', 'memory-board', 16],
  ['sudoku', 'sudoku-board', 81],
  ['crossword', 'cross-grid', 121],
  ['jigsaw', 'jigsaw-board', 49],
]) {
  window.GazelleGames.open(game, 12345, () => {});
  const board = ids.gameBody.children[0].find(node => node.classList?.contains(className));
  if (!board || board.children.length !== expected) throw new Error(`${game}: expected ${expected} cells; got ${board?.children.length}`);
  if (game === 'crossword') {
    const pad = ids.gameBody.children[0].find(node => node.classList?.contains('cross-letter-pad'));
    if (!pad || pad.children.length !== 27) throw new Error('Crossword touch keyboard should have 26 letters plus erase');
  }
  console.log(`${game}: OK (${expected} cells)`);
}
