export default {
  async mount(container) {
    await import('sonner/dist/styles.css');
    container.className = 'toaster';
  },
  unmount() {},
};
