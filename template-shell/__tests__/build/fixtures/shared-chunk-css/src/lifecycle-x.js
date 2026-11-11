// The mirror of lifecycle-w.js: it imports ./shared.js first and the kit
// stylesheet second, so the shared (screen) CSS must be listed ahead of the
// kit file - the order that pins the preliminary-to-final mapping of
// surviving chunks, which w's kit-first order alone cannot catch.
import { frameClass } from './shared.js';
import 'sonner/dist/styles.css';

export default {
  mount(container) {
    container.className = `kit ${frameClass()}`;
  },
  unmount() {},
};
