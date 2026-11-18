# Staff login and dashboard: the big upgrade list

For review. Tick what to build, cross out what to skip, and add notes. Nothing here is built yet.

**What's there today:**
- **Login:** email and password, forgot password, and set-password from an email link.
- **Home:** a readiness checklist, offers waiting for an answer, your next shift, your applications, and new jobs.
- **Other pages:**
  - Job board, Applications, My shifts (coming up and worked)
  - Availability (status, usual days, date ranges)
  - Documents (contract and shift confirmations)
  - Profile (photo, details, roles, experience, emergency contact, password)
- **The API already has:** check-in and check-out, confirm or decline offers, worker invites, and push tokens. The mobile app uses these; the website doesn't yet.

**Built in batch 1 (18 Nov 2026, not deployed yet)**
- ✅ Keep me logged in for 30 days (ticked by default; untick on shared computers)
- ✅ Show/hide password and a caps-lock warning on every staff password box
- ✅ After login, back to the page they were sent from
- ✅ Accept or decline offers on the home page
- ✅ Next shift: countdown, Add to calendar (.ics) and Google Calendar
- ✅ Running late (on the day): pick how late, add a note, and the office gets an email
- ✅ Can't make it: give a reason, the shift is given up, the office gets an email and Ops goes back to Staffing
- ✅ Earnings page: by month, this tax year and booked ahead, split into basic and holiday pay
- ✅ This month's shifts, hours and pay at the top of the home page
- ✅ Phone tab bar along the bottom of the screen

**Built in batch 2 (18 Nov 2026, not deployed yet)**
- ✅ Email me a login link: one tap, works once, lasts 15 minutes
- ✅ Day-before shift reminder email (from 10am, once per shift)
- ✅ Availability calendar: tap a day to mark it free, tap again to clear; shifts marked
- ✅ Job board: search, role, when (next 7/30 days, Fridays to Sundays), sort, hide applied
- ✅ Password strength meter on new passwords
- ✅ Sign out my other devices (the app too), from Profile

**Built in batch 3 (18 Nov 2026, not deployed yet)**
- ✅ Notification bell: offers to answer, a shift today or tomorrow, hours to check, documents to agree
- ✅ Timesheet: "Are these hours right?" on shifts worked in the last 14 days; agree, or say what's wrong and the office gets an email
- ✅ Saved jobs (a star on each job, kept on that phone or computer) and an "Only jobs I've saved" filter

**Built in batch 4 (18 Nov 2026, not deployed yet)**
- ✅ Pay day: a "Pay day (date of the month)" setting in Ops > Settings; Earnings shows the next pay day and what's been earned since the last
- ✅ Ask to be paid early (for shifts already worked): the office gets the list and an estimate, and decides
- ✅ Ask to swap a confirmed shift, optionally naming someone; the office arranges it, and they stay booked until then

**Decided 18 Nov 2026 (no build needed)**
- Premium is about the job (cocktail and silver service usually) and the owner decides who fits, so no "progress to Premium" bar
- Staff rules are common sense, so no handbook or training pages for now

**Key**
- Size: ⚡ quick (an hour or two) · 🔧 medium (half a day to a day) · 🏗 big (several days)
- 🙋 needs a decision or facts from you · ⚖️ check with an accountant or adviser before it goes live

---

## Top 15 to do first

1. ⚡ Stay signed in for 30 days ("Remember me").
2. ⚡ Show/hide password button, and a caps-lock warning.
3. 🔧 Magic-link login: get a one-tap login link by email, with no password needed.
4. ⚡ The home page greets them by name and shows the one thing they need to do next.
5. 🔧 Accept or decline a shift offer in one tap from home, with a reason when declining.
6. 🔧 Shift detail page:
   - venue, address and map link
   - start and finish, break, dress code
   - on-site contact, duties, and what to bring
7. ⚡ "Add to calendar" for each confirmed shift (.ics file and Google Calendar link).
8. 🔧 Earnings page: hours and estimated pay per shift, per week and per month, with holiday pay shown.
9. 🔧 Check in and check out on the website, not just the app. Time-stamped, with an optional location check.
10. ⚡ "Running late" and "Can't make it" buttons on a shift, which alert you straight away.
11. 🔧 Profile completeness bar showing exactly what's missing (photo, right to work, emergency contact, bank details).
12. 🔧 Availability calendar: tap days to mark free or busy, instead of typing date ranges.
13. ⚡ The day before a shift, an email or text reminder with the time, address and dress code.
14. 🔧 Install as an app on their phone: home-screen icon and full screen.
15. ⚡ Clear empty states: "No shifts yet. Here's how to get your first one."

---

## 1. Login and getting in

- ⚡ Stay signed in for 30 days ("Remember me"), with sign-out everywhere if they untick it.
- ⚡ Show/hide password eye button.
- ⚡ Caps-lock-on warning on the password field.
- ⚡ Clearer error messages: "That email and password don't match", or "Too many tries, wait 15 minutes" with a countdown.
- ⚡ After login, return them to the page they were trying to open (for example, a shift link from an email).
- 🔧 Magic-link login: enter your email and get a one-tap link that lasts 15 minutes. Good for staff who forget passwords.
- 🔧 Log in with a code sent by text, as another option to the email link. 🙋 Texts cost money per message.
- 🔧 Sign in with Google or Apple.
- 🔧 Passkeys (Face ID or fingerprint login on phones).
- 🔧 Optional two-step login (an authenticator app or a code by email), for staff who want it.
- ⚡ Password strength meter on set-password and change-password.
- ⚡ Check new passwords against known leaked passwords (Have I Been Pwned range check; the password itself never leaves the server).
- ⚡ Resend the welcome or set-password link from the login page if it has expired.
- 🔧 First-login welcome: a three-step tour (shifts, availability, profile).
- ⚡ The login page links to "Apply to join" and "Contact us" for people who are stuck.
- ⚡ Show a "new sign-in to your account" email when a new device logs in.
- 🔧 "Where you're signed in" list in the profile, with sign-out per device.
- ⚡ Neater login page: the VERGO logo, one column, big tap targets, autofocus on email.

## 2. Dashboard home

- ⚡ Greeting by name, with the time of day ("Evening, Sam").
- ⚡ A single "Next step" banner at the top: whichever matters most of confirm an offer, finish your profile, upload right to work, or set availability.
- 🔧 A next-shift card with a live countdown ("in 2 days, 4 hours"), the venue, a map link and "Add to calendar".
- 🔧 Accept or decline offers right on the home card.
- 🔧 This-month summary: shifts done, hours, estimated earnings.
- ⚡ "Your availability is out of date" nudge if not updated for 30 days.
- 🔧 Announcements box that you post from Admin (for example "Christmas season: we need bar staff, mark your December dates").
- 🔧 Activity feed: offer received, shift confirmed, document issued, pay sent.
- ⚡ Quick links: job board, my shifts, availability, profile, contact the office.
- 🔧 A shortcut to call or WhatsApp the office, and to message about a specific shift.
- 🔧 Season banner: "Christmas is busy. Set your December availability" (reuses the site's season settings).
- ⚡ Skeleton loading states instead of "Loading…".
- ⚡ Dark/light follows the phone's setting.

## 3. Shifts

- 🔧 A shift detail page for each shift:
  - date and times, break, and estimated pay
  - venue, address, map link and travel directions
  - dress code, duties, and the on-site contact (only shown once confirmed)
  - what to bring, and any risks and controls (from the assignment confirmation)
- ⚡ Add to calendar (.ics and Google).
- ⚡ Running late button: they pick an ETA and you're alerted.
- 🔧 Can't make it button: they give a reason and you're alerted immediately, so you can start finding cover. Feeds straight into your replacement process.
- 🔧 Check in and check out on the web, with an optional location check that they're near the venue. 🙋 Location tracking needs to be in the privacy notice.
- 🔧 Timesheet confirmation after the shift: "You worked 18:00–23:30, 30-minute break. Correct?" They confirm or dispute it.
- 🔧 Shift history with filters (month, venue, role) and totals.
- 🔧 Rate the shift privately (venue, team, brief accuracy). Helps you spot bad venues.
- 🔧 Swap request: offer the shift to another qualified staff member, for you to approve. 🙋 Do you want staff arranging swaps?
- 🔧 Waitlist: "Tell me if a place opens" on full jobs.
- 🏗 Team view: who else is on the shift (first names and photos), once confirmed. 🙋 Privacy: staff need to agree to this.
- ⚡ Venue notes: entrance, parking, nearest station (stored per venue, shown on every shift there).

## 4. Job board and applications

- 🔧 Filters: date, role, area/distance, pay, and Premium only.
- 🔧 Sort by soonest, nearest or best paid.
- 🔧 Distance from their home postcode on each job card.
- ⚡ "Matches you" badge when the job's role and days fit their profile and availability.
- 🔧 Apply to several dates of a multi-day job in one go.
- ⚡ Application status timeline: applied → shortlisted → offered → confirmed.
- ⚡ Withdraw application, with a reason.
- 🔧 Saved jobs.
- 🔧 Job alerts by email or push: "New bar job near you this Saturday".
- ⚡ Show why they can't apply, if they can't (for example "Upload right to work first").

## 5. Availability

- 🔧 Month calendar: tap a day for free, busy or maybe. Drag across a range.
- 🔧 Repeat patterns: "Every Friday and Saturday evening".
- ⚡ "I'm away" mode for holidays, with a return date.
- 🔧 Time-of-day options (day, evening, late) rather than whole days only.
- ⚡ A monthly prompt to update availability.
- 🔧 Season pre-booking: "Mark your Christmas dates now".
- 🔧 Your side: the Board shows who's free on a date, from these answers.

## 6. Pay and earnings

- 🔧 Earnings page: each shift's hours, rate, basic pay and holiday pay, plus totals for the week, month and tax year.
- 🔧 "Next pay day" date and what's expected in it. 🙋 What's your pay schedule (weekly, fortnightly)?
- 🏗 Payslips to download (PDF) once payroll is running. ⚖️ Needs payroll set up and HMRC registration first.
- 🔧 Bank details form, encrypted, with only the last 4 digits ever shown again. ⚖️ Sensitive data: check storage and access.
- ⚡ Holiday pay explainer: "12.07% is inside your hourly rate", in plain English.
- 🔧 Expenses claim: travel or receipts per shift, with photo upload, for you to approve.
- 🔧 P60 and P45 downloads (later, once payroll runs). ⚖️
- ⚡ Tax-year earnings total.

## 7. Documents and compliance

- 🔧 Right-to-work upload or share code entry, with status (waiting, checked, expired). ⚖️ The Home Office process has to be followed exactly.
- 🔧 Certificates: food hygiene, personal licence, SIA badge, first aid. Each has an expiry date and gets reminders before it expires.
- ⚡ Expiry warnings on the dashboard 30, 14 and 7 days out.
- 🔧 Sign documents in the portal: contract, handbook, policies. Timestamped, and the version is kept.
- ⚡ "What changed" summary when a new contract version is issued.
- 🔧 Staff handbook page: dress code standards, conduct, how to call in sick, what to do at a venue. 🙋 Needs your rules.
- 🔧 Download everything (data export) on request. Helps meet GDPR access rights.

## 8. Profile and skills

- 🔧 Photo crop and rotate before upload; reject blurry or dark photos.
- 🔧 Skills with levels: silver service, cocktails, barista, wine knowledge, cash handling, carrying three plates.
- 🔧 Experience log: past venues and events, auto-filled from VERGO shifts.
- 🔧 Premium eligibility: what's needed to be put forward for Premium (silver service or cocktails), and how close they are. 🙋 Your criteria.
- ⚡ Uniform checklist: what they own (black trousers, white shirt, bow tie, non-slip shoes).
- ⚡ Travel: max distance they'll go, whether they drive, nearest station.
- ⚡ Languages spoken.
- ⚡ Dietary or medical notes for the office only (optional). ⚖️ Special category data: only with explicit consent.
- ⚡ Contact preferences: email, text, WhatsApp, push.
- ⚡ Change email with confirmation sent to both addresses.
- ⚡ Delete my account (asks for confirmation; keeps payroll records for as long as the law requires).

## 9. Notifications and messages

- 🔧 Notification centre on the dashboard (bell icon with unread count).
- 🔧 Web push notifications for new offers, confirmations and changes.
- ⚡ Email reminders the day before a shift and 2 hours before.
- 🔧 Shift change alerts when the time, venue or dress code changes, with "Got it" acknowledgement so you know they've seen it.
- 🔧 Two-way messages per shift between staff and the office, kept with the booking.
- 🔧 Text messages for urgent offers. 🙋 Costs per text.
- ⚡ Choose which notifications they get, and how.
- ⚡ Quiet hours (no pushes between 11pm and 8am unless urgent).

## 10. Training and standards

- 🔧 Short training pages: silver service basics, bar basics, VERGO standards, health and safety. 🙋 Your content.
- 🔧 A quick quiz after each, with a badge on their profile when passed.
- 🔧 Induction checklist for new starters.
- 🔧 Feedback from you after shifts (private, kind, specific), visible to them.
- 🏗 Reliability score shown to them (confirmed, attended, on time). 🙋 Decide whether staff should see this.
- ⚡ "Refer a friend" link that pre-fills the application form. 🙋 Any reward?

## 11. Phone, app feel and accessibility

- 🔧 Installable web app: home-screen icon, full screen, works offline for the next shift's details.
- ⚡ Bottom tab bar on phones (Home, Shifts, Jobs, Availability, Profile).
- ⚡ Big tap targets and one-thumb layout.
- ⚡ Works fully with a keyboard and screen readers; checked at 320px width.
- ⚡ Pull to refresh.
- 🔧 The website and the mobile app share the same features, so staff can use either.

## 12. Security and privacy

- ⚡ Session timeout warning before automatic sign-out.
- ⚡ Sign out of all devices button.
- ⚡ Login history (last 10 sign-ins with device and rough location).
- 🔧 Alert on unusual login (new country or device).
- ⚡ Rate-limit the forgot-password form per email.
- ⚡ Privacy page for staff: what you keep, why and for how long. ⚖️
- ⚡ Bank details and IDs only visible to admins who need them, with every view logged.

## 13. Your side (Admin), to support the above

- 🔧 Post announcements to the staff dashboard.
- 🔧 See who has read a shift change or an announcement.
- 🔧 Receive "running late" and "can't make it" alerts in the Inbox, with one-click "find cover" (lists free, qualified staff for that shift).
- 🔧 Bulk-message staff matching a filter (role, area, free on a date).
- 🔧 Approve timesheets and expenses in one list.
- 🔧 Certificate and right-to-work expiry report.
- 🔧 Reliability report per worker (attended, late, dropped).
- 🔧 Staff portal usage stats: who logs in, who hasn't for 60 days.

---

## Questions for you before we build

1. **Pay schedule:** weekly, fortnightly or monthly, and which day?
2. **Swaps:** can staff arrange swaps between themselves (you approve), or does all cover go through you?
3. **Reliability score:** should staff see their own?
4. **Text messages:** are you happy to pay per text for urgent offers and reminders?
5. **Location check-in:** do you want location checked at check-in?
6. **Premium:** what makes someone Premium? Years, skills, your judgement?
7. **Handbook and training:** do you have rules written down, or shall I draft them for you to correct?
8. **Team view:** should staff see who else is on their shift?
9. **Referrals:** any reward for referring a friend?
10. **Payslips and bank details:** wait until you're registered with HMRC and running payroll?
