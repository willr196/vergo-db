# Audit fixes — post-job nav, FAQ cleanup, privacy/terms investigation

Fix the 4 issues found in the site audit. Work through them in order. All files are in `apps/api/public/`.

## 1. Fix /post-job.html navigation and footer

The post-job page still has the OLD nav and footer. Every other public page uses the shared `vergo-nav.js` and `vergo-footer.js` components.

- Replace the entire inline `<nav>` block (the one with links to `/#roles`, `/#why-vergo`, `/#event-types`, `/#paths`) with an empty `<header></header>` tag (vergo-nav.js populates it)
- Replace the inline `<footer class="footer">...</footer>` block (the one referencing hire-staff.html, hire-us.html, pricing.html, about.html etc with .html extensions) with an empty `<footer></footer>` tag (vergo-footer.js populates it)
- Remove any inline `<script>` block that defines `toggleMenu()` — the shared nav JS handles this
- Make sure `<script src="/vergo-nav.js"></script>` and `<script src="/vergo-footer.js"></script>` are present before `</body>`
- Keep the existing page-specific `<script>` for `loadRoles()` and form submission — don't remove that

## 2. Fix /faq.html navigation and footer

The FAQ page has the shared scripts loaded (`vergo-nav.js` and `vergo-footer.js` are already in the file) BUT it also has:

- An inline `<footer>` with hardcoded `© 2025 VERGO Staffing Ltd` — replace the entire inline footer content with just an empty `<footer></footer>` so vergo-footer.js takes over. The shared footer already has the correct company name (VERGO Ltd) and year
- An inline `<script>` block that defines `toggleMenu()` and the click-outside listener for closing the menu — remove this entire script block since vergo-nav.js handles it. Keep the `toggleFAQ()` function though — that's page-specific and needs to stay
- Check: if there's an inline `<header>` or `<nav>` with old links, replace with `<header></header>`

## 3. Investigate and fix /privacy and /terms pages

Both pages exist in the codebase (`privacy.html` and `terms.html`) and are linked from every footer on the site, but they returned errors when fetched.

- Check if `privacy.html` and `terms.html` exist in `apps/api/public/` and can be served
- If the files exist, check if they have the shared nav/footer scripts. If not, add `<header></header>`, `<footer></footer>`, and the shared scripts
- Check if the `privacy.html` file is actually a privacy policy or if it's mislabelled (the project knowledge showed it rendering as "Terms & Conditions" — both privacy.html AND terms.html had identical headers saying "Terms & Conditions"). If privacy.html is displaying as T&C instead of a privacy policy, fix the heading to say "Privacy Policy"
- Update `Last Updated: January 2025` to `Last Updated: March 2026` on both pages
- Make sure both pages use `<header></header>` and `<footer></footer>` (empty tags) with the shared scripts, not inline nav/footer

## 4. Clean up .bak files

There are `.bak` files being served alongside live files: `apply.html.bak`, `post-job.html.bak`, `privacy.html.bak`, `terms.html.bak`. These are publicly accessible. Delete all `.bak` files from `apps/api/public/`.

## Verification

After all fixes, confirm:
- `post-job.html` loads with the shared nav (links to /hire-staff, /jobs, /apply, /pricing, /contact) and shared footer
- `faq.html` has no inline footer or toggleMenu script, but `toggleFAQ()` still works
- `privacy.html` serves correctly and says "Privacy Policy" (not "Terms & Conditions")
- `terms.html` serves correctly and says "Terms & Conditions"
- No `.bak` files remain in `apps/api/public/`
