The About us page photos now come from `/images/gallery/` (see the `<img>`
tags in about.html). Each slot still shows a "Photo coming soon" frame if its
file is missing, so swapping a photo is just changing the `src` and alt text.

| Slot                        | Photo                                  | Shape            |
|-----------------------------|----------------------------------------|------------------|
| Wide, under the heading     | `gallery/venue-food-bar.webp`          | Landscape, 21:9  |
| Strip of three, left        | `gallery/garden-dinner-table-800.webp` | Portrait, 4:5    |
| Strip of three, middle      | `gallery/waiter-serving-800.webp`      | Portrait, 4:5    |
| Strip of three, right       | `gallery/kitchen-team-800.webp`        | Portrait, 4:5    |

Photos are cropped to fit (object-fit: cover), so keep the subject near the
centre.
