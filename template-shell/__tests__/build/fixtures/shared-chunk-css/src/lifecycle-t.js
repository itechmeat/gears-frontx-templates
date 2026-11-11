import { kitToasterClass } from './kit-toaster.js';

export default {
  mount(container) {
    container.className = kitToasterClass;
  },
  unmount() {},
};
