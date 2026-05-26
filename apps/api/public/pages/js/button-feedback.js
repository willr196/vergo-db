window.VERGOButton = {
  async runWithFeedback(btn, action, options) {
    const {
      loadingText = 'Saving…',
      successText = 'Saved ✓',
      resetAfterMs = 2000,
    } = options || {};
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = loadingText;

    try {
      const result = await action();
      btn.classList.remove('btn-loading');
      btn.classList.add('btn-success');
      btn.textContent = successText;

      if (resetAfterMs > 0) {
        setTimeout(() => {
          btn.disabled = false;
          btn.classList.remove('btn-success');
          btn.textContent = originalText;
        }, resetAfterMs);
      }

      return result;
    } catch (err) {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      btn.textContent = originalText;
      throw err;
    }
  },
};
