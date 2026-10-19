# Editing the site

Everything below is in the admin panel: **Settings > Site content**. A save
is live on vergoltd.com straight away. Nothing needs deploying.

If you save something by mistake, open **History** and press **Revert** next
to it. If it says the thing has been changed again since, revert the newer
change first.

## Prices

**Rates** tab. Each rate is per person.

- To change a price, press **Edit**, type the new amount in pounds (19.50),
  and save. Every page, the quote calculator and Ops use it at once.
- The five rates marked "Used across the site" (standard, premium, themed
  hospitality, character performers, makeup) can have their amount changed
  but can't be hidden or deleted, because pages are built around them.
- **Add a rate** for a new role, such as Santa at £45 an hour. To show it in
  an FAQ answer or a seasonal promo line, write `{{RATE_SANTA}}` (the key in
  capitals). It reads "£45" on the site and follows any later change.
- Choose **Quote only** for a role you price per brief. It never shows on the
  site, or to anyone outside the admin.

The Premium on/off switch, the after-midnight uplift and the New Year's Eve
surcharge are on the **Settings** tab, under "Premium and surcharges".

## Contact details, terms and company details

**Settings** tab, one card each:

- **Contact details**: booking email, jobs email, phone (as shown, and in
  +44 form for the call links), WhatsApp link, Instagram.
- **Booking terms**: minimum hours, overrun blocks, when the New Year's Eve
  surcharge starts, cancellation, payment terms. The minimum hours and
  overrun blocks also change what Ops charges on bookings.
- **Company details**: company name, number, registered office.
- **Promises** and **Slogan**: the guarantee wording and the strapline.

The preview on the right shows the rate and guarantee blocks as they'll
read, before you save.

## Banners and seasonal pages

**Seasonal promos** tab. Each promo (Halloween, Christmas) sets:

- when the top banner and the homepage section show (London dates, both
  days included), and when the item in the header shows if that differs;
- the banner text, the homepage heading, lines and button;
- the **dates line** on the event page, e.g. "Now booking 23–24 and 30–31
  October.";
- the day the **event page** stops selling this year. After that day the
  page stays up, so it keeps its place in Google, and says "Now booking
  Halloween 2027" with the enquiry form. Christmas is set to run to 31
  December because the page also sells New Year's Eve.

For next year, edit the promo's dates and dates line. The page switches back
on its own.

## Trying a change before it goes live

On **FAQs** and **Seasonal promos**, press **Save as draft** instead of
Publish. Nothing on the site changes. The item shows "Draft changes, not
live" with:

- **Preview**: opens the real page as it will look, with a gold "Not live"
  bar across the top. Only you see it, while logged in.
- **Publish**: puts it live.
- **Discard draft**: throws it away; the live version stays.

## Reviews, recent work, photos, FAQs

Their own tabs: add, edit, reorder with the arrows, untick **Published** to
hide something without deleting it. Photos need alt text (a description for
people who can't see the image); they're resized for the web on upload.

## If something looks wrong on the site

1. Check **History** for the last change, and **Revert** it.
2. If a page won't load at all, the site serves that page as it was built,
   ignoring the stored content, and logs the error. Tell whoever looks after
   the code; nothing you saved is lost.
3. A full rollback of a release is in `docs/site-rollout.md`.
