export default {
  async mount(container) {
    const { lazyToasterClass } = await import('./lazy-toaster.js');
    container.className = lazyToasterClass;
  },
  unmount() {},
};
