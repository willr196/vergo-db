/**
 * About us photo slots.
 *
 * Each .about-photo holds an <img> pointing at a file in /images/about/ that
 * may not exist yet. Until it does, the slot shows its placeholder frame; the
 * moment the file is uploaded, the photo covers the frame. No markup change
 * needed to go from placeholder to photo.
 */
(function () {
  function markLoaded(img) {
    if (img.naturalWidth > 0) img.closest('.about-photo').classList.add('is-loaded');
  }

  document.querySelectorAll('.about-photo img').forEach(function (img) {
    if (img.complete) markLoaded(img);
    else img.addEventListener('load', function () { markLoaded(img); });
  });
})();
