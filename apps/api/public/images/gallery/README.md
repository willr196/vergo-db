Photos for /gallery, also used on the homepage strip and the About us page.

Each photo has two files: `<name>.webp` (full size, opened in the lightbox)
and `<name>-800.webp` (800px wide, shown in the grid). Keep both under about
350KB and strip location data before adding one (converting through sharp
does this by default). To add a photo, add both files and a new
`<li class="gallery-item">` in gallery.html with real alt text.

`bartender-home-kitchen-crop-800.webp` is an 800x1067 crop of
`bartender-home-kitchen.webp` with the foreground counter (ketchup bottle, plate)
cut out. It is used on the /hire photo strip only, not in the gallery grid.
