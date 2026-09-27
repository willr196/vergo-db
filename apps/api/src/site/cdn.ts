/**
 * Purging a CDN after a content save.
 *
 * Today there is nothing to purge: vergoltd.com is served straight from Fly
 * (the response headers say server: Fly, via: 1.1 fly.io), with no cache in
 * front. The pages are sent with s-maxage=60, so if a CDN is ever put in front
 * of the site, the most a visitor can see is a minute-old copy until this is
 * wired to that CDN's purge API.
 *
 * Kept as a hook so every save already calls it: the admin routes and the
 * seed don't change when a CDN arrives.
 */
export async function purgeCdn(): Promise<void> {
  // No CDN in front of the site; nothing to purge.
}
