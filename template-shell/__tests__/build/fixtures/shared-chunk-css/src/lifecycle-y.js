// Imports the two shared chunks in this order on purpose: the shared (screen)
// CSS first, then the kit-toaster chunk, whose stylesheet is the kit CSS. The
// import-editor fixture plugin reorders the rendered chunk's import list, so
// the attribution must follow the edited order, not this one.
import { frameClass } from './shared.js';
import { kitToasterClass } from './kit-toaster.js';

export default {
  mount(container) {
    container.className = `${frameClass()} ${kitToasterClass}`;
  },
  unmount() {},
};
