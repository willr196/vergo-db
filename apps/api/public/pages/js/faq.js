(function () {
  'use strict';

  function toggleFAQ(button) {
    const item = button.closest('.faq-item');
    const wasActive = item.classList.contains('active');

    document.querySelectorAll('.faq-item.active').forEach((el) => {
      el.classList.remove('active');
    });

    if (!wasActive) {
      item.classList.add('active');
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(() => {
    document.querySelectorAll('.faq-question').forEach((button) => {
      button.addEventListener('click', () => toggleFAQ(button));
    });
  });
})();

