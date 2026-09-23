/**
 * Gallery lightbox.
 *
 * Each photo is a plain link to the full-size file, so without JS (or without
 * <dialog> support) a tap still opens the photo. With JS the link opens the
 * dialog instead, and the arrows, swipes and arrow keys step through the set.
 */
(function () {
  var dialog = document.querySelector('.lightbox');
  var links = Array.prototype.slice.call(document.querySelectorAll('.gallery-link'));
  if (!dialog || typeof dialog.showModal !== 'function' || !links.length) return;

  var img = dialog.querySelector('.lightbox-img');
  var caption = dialog.querySelector('.lightbox-caption');
  var current = 0;

  function show(index) {
    current = (index + links.length) % links.length;
    var thumb = links[current].querySelector('img');
    img.src = links[current].href;
    img.alt = thumb.alt;
    caption.textContent = thumb.alt + ' (' + (current + 1) + ' of ' + links.length + ')';
  }

  links.forEach(function (link, i) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      show(i);
      dialog.showModal();
    });
  });

  dialog.querySelector('.lightbox-close').addEventListener('click', function () { dialog.close(); });
  dialog.querySelector('.lightbox-prev').addEventListener('click', function () { show(current - 1); });
  dialog.querySelector('.lightbox-next').addEventListener('click', function () { show(current + 1); });

  // A click on the dark backdrop (the dialog itself, not its contents) closes.
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
  });

  var startX = null;
  dialog.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    startX = null;
  });

  // Hand focus back to the photo that was opened.
  dialog.addEventListener('close', function () { links[current].focus(); });
})();
