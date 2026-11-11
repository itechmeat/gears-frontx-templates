import 'sonner/dist/styles.css';
import { frameClass } from './shared.js';

export default {
  mount(container) {
    container.className = `kit ${frameClass()}`;
  },
  unmount() {},
};
