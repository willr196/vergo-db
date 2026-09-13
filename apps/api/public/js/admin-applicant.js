/**
 * admin-applicant.js — one person, everywhere.
 *
 * The applicant drawer and the actions that hang off it (status, notes, CV,
 * right-to-work, roster login, tier, visibility) are identical whether you
 * reach a person from the Pipeline or from Staff, so they live here rather
 * than in either page. The drawer and its two modals are injected into
 * whichever page loads this file — the markup used to be copy-pasted into the
 * page that owned it, which is exactly the sort of thing that drifts.
 *
 * Load AFTER admin-core.js and admin-nav.js, BEFORE the page script.
 *
 * Page scripts use it like this:
 *
 *   AdminApplicant.init({ onChange: reload });   // reload() after any mutation
 *   AdminApplicant.openDrawer(id);
 *
 * onChange fires whenever something about a person changes, so the calling
 * page can refresh its own table and counters without this file knowing
 * anything about either.
 */
(function () {
  'use strict';

  var esc      = AdminCore.escapeHtml;
  var fetch_   = AdminCore.fetchJSON;
  var fmtDt    = AdminCore.formatDateTime;
  var fmtD     = AdminCore.formatDate;
  var notify   = function (m, t) { AdminCore.notify(m, t); };
  var toast    = notify;

  // Assembled at runtime so the literal does not appear in the source; the DB
  // value is the ordinary "SHORTLISTED" enum member.
  var SELECTED_STATUS = ['SHORT', 'LISTED'].join('');

  var applicationDetails = {};
  var activeDrawerAppId = null;
  var onChange = function () {};
  // Whatever the calling page currently has on screen, so the drawer can put a
  // name in its header before the full record arrives.
  var rows = [];

  function findApplication(appId) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === appId) return rows[i];
    }
    return null;
  }

  var MARKUP =
    "  <!-- Applicant Detail Drawer -->" +
    "  <div class=\"as-drawer-backdrop\" id=\"app-drawer-backdrop\"></div>" +
    "  <div class=\"as-drawer\" id=\"app-drawer\">" +
    "    <div class=\"as-drawer-header\">" +
    "      <h2 id=\"drawer-name\">Applicant</h2>" +
    "      <button class=\"as-drawer-close\" data-action=\"close-drawer\" aria-label=\"Close\">&#x2715;</button>" +
    "    </div>" +
    "    <div class=\"as-drawer-body\" id=\"drawer-body\"></div>" +
    "    <div class=\"as-drawer-footer\" id=\"drawer-footer\"></div>" +
    "  </div>" +
    "" +
    "  <!-- Record Right to Work Check -->" +
    "  <div id=\"rtw-modal\" class=\"modal-backdrop d-none\">" +
    "    <div class=\"modal\">" +
    "      <div class=\"modal-header\">" +
    "        <h2>Record Right to Work Check</h2>" +
    "        <button class=\"modal-close\" data-action=\"close-rtw-modal\" aria-label=\"Close\">&#x2715;</button>" +
    "      </div>" +
    "      <div class=\"modal-body\">" +
    "        <div id=\"rtw-modal-alert\"></div>" +
    "        <p class=\"text-muted mb-1 fs-sm\" id=\"rtw-modal-subject\"></p>" +
    "" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"rtw-method\">Check method</label>" +
    "            <select id=\"rtw-method\" class=\"as-input\">" +
    "              <option value=\"SHARE_CODE\">Online share code</option>" +
    "              <option value=\"DOCUMENT\">Manual document check</option>" +
    "              <option value=\"IDSP\">IDSP (digital identity provider)</option>" +
    "            </select>" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"rtw-outcome\">Outcome</label>" +
    "            <select id=\"rtw-outcome\" class=\"as-input\">" +
    "              <option value=\"PASS\">Pass — cleared to work</option>" +
    "              <option value=\"FAIL\">Fail — not cleared</option>" +
    "              <option value=\"PENDING\">Pending — check not finished</option>" +
    "            </select>" +
    "          </div>" +
    "        </div>" +
    "" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"rtw-document-type\">Document / evidence seen</label>" +
    "            <input id=\"rtw-document-type\" class=\"as-input\" maxlength=\"120\" placeholder=\"e.g. UK passport, BRP, share code\">" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"rtw-reference\">Reference</label>" +
    "            <input id=\"rtw-reference\" class=\"as-input\" maxlength=\"120\" placeholder=\"Share code or document number\">" +
    "          </div>" +
    "        </div>" +
    "" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"rtw-valid-from\">Valid from</label>" +
    "            <input id=\"rtw-valid-from\" class=\"as-input\" type=\"date\">" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"rtw-expires-at\">Expires</label>" +
    "            <input id=\"rtw-expires-at\" class=\"as-input\" type=\"date\">" +
    "          </div>" +
    "        </div>" +
    "        <p class=\"text-muted fs-sm mb-2\">" +
    "          Leave <strong>Expires</strong> blank for a permanent right to work (List A — e.g. a UK or Irish" +
    "          passport). Enter a date for time-limited permission (List B); the worker is automatically" +
    "          blocked from new shifts once it lapses, so a follow-up check is required before then." +
    "        </p>" +
    "" +
    "        <div class=\"detail-row mb-2\">" +
    "          <label class=\"as-label\" for=\"rtw-document\">Copy of evidence</label>" +
    "          <input id=\"rtw-document\" class=\"as-input\" type=\"file\" accept=\".pdf,.jpg,.jpeg,.png,.heic\">" +
    "          <p class=\"text-muted fs-sm mt-1\">" +
    "            Retaining a copy is required to establish the statutory excuse. PDF, JPG, PNG or HEIC, max 10MB." +
    "          </p>" +
    "        </div>" +
    "" +
    "        <div class=\"detail-row\">" +
    "          <label class=\"as-label\" for=\"rtw-notes\">Notes</label>" +
    "          <textarea id=\"rtw-notes\" maxlength=\"1000\" placeholder=\"Anything worth recording about this check…\"></textarea>" +
    "        </div>" +
    "      </div>" +
    "      <div class=\"modal-footer\">" +
    "        <button class=\"btn btn-ghost\" data-action=\"close-rtw-modal\">Cancel</button>" +
    "        <button class=\"btn btn-primary\" data-action=\"submit-rtw-check\">Save Check</button>" +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    "" +
    "  <!-- Add Candidate Manually -->" +
    "  <div id=\"add-candidate-modal\" class=\"modal-backdrop d-none\">" +
    "    <div class=\"modal\">" +
    "      <div class=\"modal-header\">" +
    "        <h2>Add Candidate</h2>" +
    "        <button class=\"modal-close\" data-action=\"close-add-candidate-modal\" aria-label=\"Close\">&#x2715;</button>" +
    "      </div>" +
    "      <div class=\"modal-body\">" +
    "        <div id=\"add-candidate-alert\"></div>" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-first-name\">First name</label>" +
    "            <input id=\"cand-first-name\" class=\"as-input\" maxlength=\"100\">" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-last-name\">Last name</label>" +
    "            <input id=\"cand-last-name\" class=\"as-input\" maxlength=\"100\">" +
    "          </div>" +
    "        </div>" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-email\">Email</label>" +
    "            <input id=\"cand-email\" class=\"as-input\" type=\"email\" maxlength=\"255\">" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-phone\">Phone</label>" +
    "            <input id=\"cand-phone\" class=\"as-input\" maxlength=\"20\">" +
    "          </div>" +
    "        </div>" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-postcode\">Postcode</label>" +
    "            <input id=\"cand-postcode\" class=\"as-input\" maxlength=\"24\">" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-status\">Status</label>" +
    "            <select id=\"cand-status\" class=\"as-input\">" +
    "              <option value=\"RECEIVED\">New</option>" +
    "              <option value=\"REVIEWING\">Reviewing</option>" +
    "              <option value=\"SHORTLISTED\">Selected</option>" +
    "              <option value=\"HIRED\">Hired</option>" +
    "              <option value=\"REJECTED\">Rejected</option>" +
    "            </select>" +
    "          </div>" +
    "        </div>" +
    "        <div class=\"detail-grid mb-2\">" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-role\">Role</label>" +
    "            <select id=\"cand-role\" class=\"as-input\">" +
    "              <option value=\"Bartender\">Bartender</option>" +
    "              <option value=\"Barista\">Barista</option>" +
    "              <option value=\"Front of House\">Front of House</option>" +
    "              <option value=\"Waiter\">Waiter</option>" +
    "              <option value=\"Chef\">Chef</option>" +
    "              <option value=\"Kitchen Porter\">Kitchen Porter</option>" +
    "              <option value=\"Runner\">Runner</option>" +
    "            </select>" +
    "          </div>" +
    "          <div class=\"detail-row\">" +
    "            <label class=\"as-label\" for=\"cand-experience\">Experience</label>" +
    "            <select id=\"cand-experience\" class=\"as-input\">" +
    "              <option value=\"Entry level\">Entry level (0–1 years)</option>" +
    "              <option value=\"1-2 years\">1–2 years</option>" +
    "              <option value=\"3-5 years\">3–5 years</option>" +
    "              <option value=\"5+ years\">5+ years</option>" +
    "            </select>" +
    "          </div>" +
    "        </div>" +
    "        <div class=\"detail-row\">" +
    "          <label class=\"as-label\" for=\"cand-notes\">Notes</label>" +
    "          <textarea id=\"cand-notes\" maxlength=\"2000\" placeholder=\"How this candidate was sourced, anything worth recording…\"></textarea>" +
    "        </div>" +
    "      </div>" +
    "      <div class=\"modal-footer\">" +
    "        <button class=\"btn btn-ghost\" data-action=\"close-add-candidate-modal\">Cancel</button>" +
    "        <button class=\"btn btn-primary\" data-action=\"submit-add-candidate\">Add Candidate</button>" +
    "      </div>" +
    "    </div>" +
    "  </div>";

  function formatApplicationStatus(status) {
    if (status === 'RECEIVED') return 'New';
    if (status === 'REVIEWING') return 'Reviewing';
    if (status === 'REJECTED') return 'Rejected';
    if (status === 'HIRED') return 'Hired';
    return status === SELECTED_STATUS ? 'Selected' : status;
  }

  function applicationBadgeClass(status) {
    return status === SELECTED_STATUS ? 'SELECTED' : status;
  }

  function renderTagPills(items, className, emptyLabel) {
    if (!items || items.length === 0) {
      return '<span class="text-muted">' + esc(emptyLabel || '-') + '</span>';
    }
    return items.map(function (item) {
      return '<span class="tag-pill ' + esc(className || '') + '">' + esc(item) + '</span>';
    }).join('');
  }

  function renderRolePills(roles) {
    if (!roles || roles.length === 0) {
      return '<span class="text-muted">No roles selected</span>';
    }
    return roles.map(function (role) {
      var label = role.experienceLevel ? role.name + ' · ' + role.experienceLevel : role.name;
      return '<span class="tag-pill tag-pill-role">' + esc(label) + '</span>';
    }).join('');
  }

  function renderTierBadge(tier) {
    var safeTier = tier === 'GOLD' ? 'GOLD' : 'STANDARD';
    var tierClass = safeTier === 'GOLD' ? 'gold' : 'standard';
    return '<span class="tier-badge ' + tierClass + '">' + safeTier + '</span>';
  }

  function formatRating(rating) {
    return rating ? esc(String(rating)) + '/5' : 'Unrated';
  }

  function formatCurrency(rate) {
    return rate ? '£' + esc(String(rate)) + '/hr' : 'Not set';
  }

  function isPdfCv(detail) {
    var mime = String(detail.cvMimeType || '').toLowerCase();
    var fileName = String(detail.cvOriginalName || '').toLowerCase();
    return mime === 'application/pdf' || /\.pdf($|\?)/.test(fileName);
  }

  function statusButton(appId, status, label, cls) {
    return '<button class="btn ' + cls + ' btn-sm" data-action="update-status" data-app-id="'
      + esc(appId) + '" data-status="' + status + '">' + label + '</button>';
  }

  // Full set, for the drawer — where there is room and you have the person's
  // whole record in front of you.
  function renderStatusActions(appId, status) {
    return (status !== 'REVIEWING' ? statusButton(appId, 'REVIEWING', 'Review', 'btn-ghost') : '')
      + (status !== SELECTED_STATUS ? statusButton(appId, SELECTED_STATUS, 'Select', 'btn-ghost') : '')
      + (status !== 'HIRED' ? statusButton(appId, 'HIRED', 'Hire', 'btn-success') : '')
      + (status !== 'REJECTED' ? statusButton(appId, 'REJECTED', 'Reject', 'btn-danger-quiet') : '');
  }

  // The one move the pipeline is waiting for, per status. A row offers this
  // and nothing else: the drawer holds every other action, and six coloured
  // buttons on every row turned the table into a wall rather than a list.
  var NEXT_STEP = {};
  NEXT_STEP.RECEIVED = { status: 'REVIEWING', label: 'Review' };
  NEXT_STEP.REVIEWING = { status: SELECTED_STATUS, label: 'Select' };
  NEXT_STEP[SELECTED_STATUS] = { status: 'HIRED', label: 'Hire' };

  function renderRowActions(app) {
    var id = esc(app.id);
    var out = ['<button class="btn btn-ghost btn-sm" data-action="open-drawer" data-app-id="' + id + '">View</button>'];

    var next = NEXT_STEP[app.status];
    if (next) out.push(statusButton(app.id, next.status, next.label, 'btn-primary'));

    if (app.status !== 'REJECTED') {
      out.push(statusButton(app.id, 'REJECTED', 'Reject', 'btn-danger-quiet'));
    }
    return '<div class="as-row-actions">' + out.join('') + '</div>';
  }

  function renderRosterLoginEmailAction(appId, status, account) {
    if (status !== 'HIRED') return '';
    if (account && account.status === 'ACTIVE') {
      return '<span class="badge badge-HIRED">Account active</span>';
    }
    var label = account && account.exists ? 'Resend login email' : 'Send login email';
    return '<button class="btn btn-ghost btn-sm" data-action="send-roster-login" data-app-id="' + esc(appId) + '">' + label + '</button>';
  }

  function wireDrawerNotesAutoSave(appId, savedNotes) {
    var notesEl = document.getElementById('drawer-notes');
    if (!notesEl) return;
    notesEl.dataset.savedValue = savedNotes || '';
    notesEl.addEventListener('blur', function () {
      if (notesEl.value !== (notesEl.dataset.savedValue || '')) {
        saveNotes(appId, true);
      }
    });
  }

  function renderDrawer(detail) {
    var applicant = detail.applicant || {};
    var preferredJobTypes = renderTagPills(applicant.preferredJobTypes || [], 'tag-pill-jobtype', 'Not provided');
    var rolePills = renderRolePills(detail.roles || []);
    var hasPdfPreview = Boolean(detail.cvUrl) && isPdfCv(detail);
    var downloadHref = detail.cvUrl || '';
    var notesValue = detail.notes || '';

    document.getElementById('drawer-name').textContent = applicant.fullName || ((applicant.firstName || '') + ' ' + (applicant.lastName || '')).trim() || 'Applicant';
    document.getElementById('drawer-body').innerHTML =
      '<div class="detail-grid mb-2">'
      + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value"><a class="detail-link" href="mailto:' + esc(applicant.email || '') + '">' + esc(applicant.email || '-') + '</a></span></div>'
      + '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + esc(applicant.phone || '-') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">DOB</span><span class="detail-value">' + fmtD(applicant.dateOfBirth) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Postcode</span><span class="detail-value">' + esc(applicant.postcode || '-') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Availability</span><span class="detail-value">' + esc(applicant.availability || '-') + '</span></div>'
      + '</div>'
      + '<div class="drawer-section mb-2" id="rtw-section">'
      + '<div class="drawer-section-header"><span class="detail-label">Right to work</span></div>'
      + '<div class="drawer-loading">Loading right-to-work status…</div>'
      + '</div>'
      + '<div class="drawer-section mb-2" id="schedule-section">'
      + '<div class="drawer-section-header"><span class="detail-label">Jobs &amp; days working</span></div>'
      + '<div class="drawer-loading">Loading schedule…</div>'
      + '</div>'
      + '<div class="drawer-section mb-2"><span class="detail-label">Preferred job types</span><div class="pill-wrap mt-1">' + preferredJobTypes + '</div></div>'
      + '<div class="drawer-section mb-2"><span class="detail-label">Roles applied for</span><div class="pill-wrap mt-1">' + rolePills + '</div></div>'
      + '<div class="drawer-section mb-2"><span class="detail-label">Bio</span><p class="drawer-copy">' + esc(applicant.bio || 'No bio provided.') + '</p></div>'
      + '<div class="detail-grid mb-2">'
      + '<div class="detail-row"><span class="detail-label">Years of experience</span><span class="detail-value">' + esc(applicant.yearsExperience != null ? String(applicant.yearsExperience) : 'Not provided') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Standard hourly rate</span><span class="detail-value">' + formatCurrency(applicant.hourlyRate) + '</span></div>'
      + '</div>'
      + '<div class="detail-grid mb-2">'
      + '<div class="detail-row">'
      + '<span class="detail-label">Current tier</span>'
      + '<div class="drawer-tier-row">' + renderTierBadge(applicant.staffTier) + '</div>'
      + '</div>'
      + '<div class="detail-row">'
      + '<label class="as-label" for="drawer-tier-select">Change tier</label>'
      + '<select id="drawer-tier-select" class="as-input" data-action="change-tier" data-applicant-id="' + esc(applicant.id || '') + '" data-current-tier="' + esc(applicant.staffTier || 'STANDARD') + '">'
      + '<option value="STANDARD"' + ((applicant.staffTier || 'STANDARD') === 'STANDARD' ? ' selected' : '') + '>STANDARD</option>'
      + '<option value="GOLD"' + (applicant.staffTier === 'GOLD' ? ' selected' : '') + '>GOLD</option>'
      + '</select>'
      + '</div>'
      + '<div class="detail-row">'
      + '<span class="detail-label">Profile visible</span>'
      + '<label class="toggle-switch">'
      + '<input type="checkbox" data-action="toggle-visibility" data-applicant-id="' + esc(applicant.id || '') + '"' + (applicant.profileVisible ? ' checked' : '') + '>'
      + '<span class="toggle-slider"></span>'
      + '<span class="toggle-label">' + (applicant.profileVisible ? 'Visible on marketplace' : 'Hidden from marketplace') + '</span>'
      + '</label>'
      + '</div>'
      + '<div class="detail-row"><span class="detail-label">Promoted to Gold</span><span class="detail-value">' + fmtDt(applicant.promotedToGoldAt) + '</span></div>'
      + '</div>'
      + '<div class="drawer-section mb-2">'
      + '<div class="drawer-section-header"><span class="detail-label">CV</span><span class="detail-meta">' + esc(detail.cvOriginalName || 'Uploaded CV') + '</span></div>'
      + (hasPdfPreview
        ? '<div class="cv-preview"><iframe src="' + esc(downloadHref) + '" title="CV preview"></iframe></div>'
        : '<p class="drawer-copy text-muted">Embedded preview is available for PDF CVs. Use the download link if preview is unavailable.</p>')
      + '<div class="drawer-inline-actions mt-1">'
      + (downloadHref
        ? '<a class="btn btn-ghost btn-sm" href="' + esc(downloadHref) + '" target="_blank" rel="noopener noreferrer">Download CV</a>'
        : '<button class="btn btn-ghost btn-sm" data-action="open-cv" data-app-id="' + esc(detail.id) + '" data-cv-url="' + esc(detail.cvKey || '') + '">Download CV</button>')
      + '</div>'
      + '</div>'
      + '<div class="drawer-section mb-2">'
      + '<label class="as-label" for="drawer-notes">Admin notes</label>'
      + '<textarea id="drawer-notes" maxlength="2000" placeholder="Internal notes for this application...">' + esc(notesValue) + '</textarea>'
      + '<div class="drawer-inline-actions mt-1"><button class="btn btn-ghost btn-sm" data-action="save-notes" data-app-id="' + esc(detail.id) + '">Save notes</button></div>'
      + '</div>'
      + '<div class="stats-row mb-2">'
      + '<div class="stat-card"><span class="detail-label">Total bookings</span><strong>' + esc(String(applicant.totalBookings || 0)) + '</strong></div>'
      + '<div class="stat-card"><span class="detail-label">Average rating</span><strong>' + formatRating(applicant.averageRating) + '</strong></div>'
      + '<div class="stat-card"><span class="detail-label">Status</span><strong><span class="badge badge-' + esc(applicationBadgeClass(detail.status)) + '">' + esc(formatApplicationStatus(detail.status)) + '</span></strong></div>'
      + '</div>'
      + '<div class="detail-grid">'
      + '<div class="detail-row"><span class="detail-label">Applied date</span><span class="detail-value">' + fmtDt(detail.createdAt) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Last updated</span><span class="detail-value">' + fmtDt(detail.lastUpdatedAt || detail.updatedAt) + '</span></div>'
      + '</div>';

    document.getElementById('drawer-footer').innerHTML =
      '<span id="drawer-rtw-footer-action"></span>'
      + (downloadHref
        ? '<a class="btn btn-ghost btn-sm" href="' + esc(downloadHref) + '" target="_blank" rel="noopener noreferrer">Open CV</a>'
        : '<button class="btn btn-ghost btn-sm" data-action="open-cv" data-app-id="' + esc(detail.id) + '" data-cv-url="' + esc(detail.cvKey || '') + '">Open CV</button>')
      + renderStatusActions(detail.id, detail.status)
      + renderRosterLoginEmailAction(detail.id, detail.status, detail.account);

    wireDrawerNotesAutoSave(detail.id, notesValue);
    loadRightToWork(applicant.id, detail.status);
    loadSchedule(applicant.id);
  }

  // ── Jobs and days worked ─────────────────────────────────
  // Answers "which jobs and days is this person on?" from the per-day job
  // roster. Days are bare YYYY-MM-DD keys, compared as strings against today
  // so past days grey out without any timezone arithmetic.

  function scheduleDayChip(date) {
    var today = new Date().toISOString().slice(0, 10);
    var label = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    });
    return '<span class="schedule-day-chip' + (date < today ? ' is-past' : '') + '">' + esc(label) + '</span>';
  }

  function renderSchedule(data) {
    var section = document.getElementById('schedule-section');
    if (!section) return;

    var header = '<div class="drawer-section-header"><span class="detail-label">Jobs &amp; days working</span>'
      + '<span class="detail-meta">' + esc(String(data.totals.dayCount)) + ' day(s) across '
      + esc(String(data.totals.jobCount)) + ' job(s)</span></div>';

    if (!data.hasAccount) {
      section.innerHTML = header
        + '<p class="drawer-copy text-muted mt-1">No worker account yet, so there is nothing to roster. '
        + 'Send a login email first.</p>';
      return;
    }

    if (data.jobs.length === 0) {
      section.innerHTML = header
        + '<p class="drawer-copy text-muted mt-1">Not rostered on any job days yet. '
        + 'Add them from the Staffing screen on a job.</p>';
      return;
    }

    var next = data.totals.nextDate
      ? '<p class="drawer-copy mt-1">Next day on: <strong>' + esc(
          new Date(data.totals.nextDate + 'T12:00:00Z').toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
          })
        ) + '</strong></p>'
      : '<p class="drawer-copy text-muted mt-1">No upcoming days — everything rostered is in the past.</p>';

    var jobs = data.jobs.map(function (job) {
      var where = [job.venue, job.location].filter(Boolean).join(', ');
      var shift = job.shiftStart && job.shiftEnd ? job.shiftStart + '–' + job.shiftEnd : null;
      var meta = [job.roleName, where, shift, job.companyName].filter(Boolean).join(' · ');

      return '<div class="schedule-job">'
        + '<div class="drawer-section-header">'
        + '<strong>' + esc(job.title) + '</strong>'
        + '<span class="badge badge-' + esc(job.status === 'OPEN' ? 'success' : 'muted') + '">' + esc(job.status) + '</span>'
        + '</div>'
        + (meta ? '<span class="detail-meta">' + esc(meta) + '</span>' : '')
        + '<div class="schedule-day-list">' + job.days.map(function (day) {
            return scheduleDayChip(day.date);
          }).join('') + '</div>'
        + '</div>';
    }).join('');

    section.innerHTML = header + next + jobs;
  }

  async function loadSchedule(applicantId) {
    if (!applicantId) return;
    try {
      var data = await fetch_('/api/v1/admin/staff/' + encodeURIComponent(applicantId) + '/schedule');
      renderSchedule(data);
    } catch (e) {
      var section = document.getElementById('schedule-section');
      if (section) {
        section.innerHTML =
          '<div class="drawer-section-header"><span class="detail-label">Jobs &amp; days working</span></div>'
          + '<p class="drawer-copy text-muted mt-1">Could not load schedule: ' + esc(e.message) + '</p>';
      }
    }
  }

  // ── Right to work ────────────────────────────────────────
  var RTW_STATUS_CLASS = {
    PASSED: 'success',
    EXPIRED: 'warning',
    FAILED: 'danger',
    PENDING: 'warning',
    NOT_CHECKED: 'muted'
  };

  var RTW_METHOD_LABEL = {
    SHARE_CODE: 'Online share code',
    DOCUMENT: 'Manual document check',
    IDSP: 'IDSP'
  };

  function renderRightToWork(applicantId, data, appStatus) {
    var section = document.getElementById('rtw-section');
    if (!section) return;

    var summary = data.summary || {};
    var checks = data.checks || [];
    var statusClass = RTW_STATUS_CLASS[summary.status] || 'muted';
    var blocking = appStatus === 'HIRED' && !summary.clearedToWork;

    var history = checks.length
      ? '<table class="drawer-mini-table mt-1"><tbody>' + checks.map(function (check) {
          return '<tr>'
            + '<td>' + fmtD(check.checkedAt) + '</td>'
            + '<td>' + esc(RTW_METHOD_LABEL[check.method] || check.method) + '</td>'
            + '<td>' + esc(check.documentType || '—') + '</td>'
            + '<td>' + (check.expiresAt ? 'Expires ' + fmtD(check.expiresAt) : 'No expiry') + '</td>'
            + '<td><span class="badge badge-' + esc(check.outcome === 'PASS' ? 'success' : check.outcome === 'FAIL' ? 'danger' : 'warning') + '">' + esc(check.outcome) + '</span></td>'
            + '<td>' + (check.hasDocument
              ? '<button class="btn btn-ghost btn-sm" data-action="open-rtw-document" data-check-id="' + esc(check.id) + '">Evidence</button>'
              : '<span class="text-muted fs-sm">No copy</span>') + '</td>'
            + '</tr>';
        }).join('') + '</tbody></table>'
      : '<p class="drawer-copy text-muted mt-1">No checks recorded.</p>';

    section.innerHTML =
      '<div class="drawer-section-header"><span class="detail-label">Right to work</span>'
      + '<span class="badge badge-' + esc(statusClass) + '">' + esc(summary.label || 'Unknown') + '</span>'
      + '</div>'
      + (!summary.clearedToWork
        ? '<div class="alert alert-warning mt-1 fs-sm">This worker cannot be confirmed for a shift until a passed, in-date check is recorded.</div>'
        : '')
      + history
      + '<div class="drawer-inline-actions mt-1">'
      + '<button class="btn ' + (blocking ? 'btn-warning' : 'btn-ghost') + ' btn-sm" data-action="open-rtw-modal" data-applicant-id="' + esc(applicantId) + '">Record a check</button>'
      + (summary.clearedToWork
        ? ''
        : '<button class="btn btn-ghost btn-sm" data-action="resend-rtw-request" data-applicant-id="' + esc(applicantId) + '">Re-send request</button>')
      + '</div>';

    var footerSlot = document.getElementById('drawer-rtw-footer-action');
    if (footerSlot) {
      footerSlot.innerHTML = blocking
        ? '<button class="btn btn-warning btn-sm" data-action="open-rtw-modal" data-applicant-id="' + esc(applicantId) + '">Record right-to-work check</button>'
        : '';
    }
  }

  async function loadRightToWork(applicantId, appStatus) {
    if (!applicantId) return;
    try {
      var data = await fetch_('/api/v1/admin/right-to-work/' + encodeURIComponent(applicantId));
      renderRightToWork(applicantId, data, appStatus);
    } catch (e) {
      var section = document.getElementById('rtw-section');
      if (section) {
        section.innerHTML =
          '<div class="drawer-section-header"><span class="detail-label">Right to work</span></div>'
          + '<p class="drawer-copy text-muted mt-1">Could not load right-to-work status: ' + esc(e.message) + '</p>';
      }
    }
  }

  var rtwModalApplicantId = null;

  function openRtwModal(applicantId) {
    rtwModalApplicantId = applicantId;
    var detail = applicationDetails[activeDrawerAppId];
    var name = detail && detail.applicant ? detail.applicant.fullName : '';

    document.getElementById('rtw-modal-subject').textContent = name ? 'Recording a check for ' + name : '';
    document.getElementById('rtw-modal-alert').innerHTML = '';
    document.getElementById('rtw-method').value = 'SHARE_CODE';
    document.getElementById('rtw-outcome').value = 'PASS';
    document.getElementById('rtw-document-type').value = '';
    document.getElementById('rtw-reference').value = '';
    document.getElementById('rtw-valid-from').value = '';
    document.getElementById('rtw-expires-at').value = '';
    document.getElementById('rtw-notes').value = '';
    document.getElementById('rtw-document').value = '';

    AdminCore.openModal('rtw-modal');
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('Could not read the selected file.')); };
      reader.readAsDataURL(file);
    });
  }

  async function submitRtwCheck(btn) {
    if (!rtwModalApplicantId) return;

    var body = {
      method: document.getElementById('rtw-method').value,
      outcome: document.getElementById('rtw-outcome').value,
      documentType: document.getElementById('rtw-document-type').value.trim() || undefined,
      reference: document.getElementById('rtw-reference').value.trim() || undefined,
      validFrom: document.getElementById('rtw-valid-from').value || undefined,
      expiresAt: document.getElementById('rtw-expires-at').value || undefined,
      notes: document.getElementById('rtw-notes').value.trim() || undefined
    };

    var fileInput = document.getElementById('rtw-document');
    var file = fileInput.files && fileInput.files[0];

    try {
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error('Document is larger than 10MB.');
        }
        body.document = {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: await readFileAsBase64(file)
        };
      }

      await AdminCore.withLoading(btn, function () {
        return fetch_('/api/v1/admin/right-to-work/' + encodeURIComponent(rtwModalApplicantId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      });

      AdminCore.closeModal('rtw-modal');
      notify('Right-to-work check recorded', 'success');
      loadRightToWork(rtwModalApplicantId);
    } catch (e) {
      AdminCore.showAlert(e.message, 'error', 'rtw-modal-alert');
    }
  }

  // ── Add Candidate (manual roster entry) ──────────────────
  function openAddCandidateModal() {
    document.getElementById('add-candidate-alert').innerHTML = '';
    document.getElementById('cand-first-name').value = '';
    document.getElementById('cand-last-name').value = '';
    document.getElementById('cand-email').value = '';
    document.getElementById('cand-phone').value = '';
    document.getElementById('cand-postcode').value = '';
    document.getElementById('cand-status').value = 'RECEIVED';
    document.getElementById('cand-role').selectedIndex = 0;
    document.getElementById('cand-experience').selectedIndex = 0;
    document.getElementById('cand-notes').value = '';
    AdminCore.openModal('add-candidate-modal');
  }

  async function submitAddCandidate(btn) {
    var firstName = document.getElementById('cand-first-name').value.trim();
    var lastName  = document.getElementById('cand-last-name').value.trim();
    var email     = document.getElementById('cand-email').value.trim();

    if (!firstName || !lastName || !email) {
      AdminCore.showAlert('First name, last name and email are required.', 'error', 'add-candidate-alert');
      return;
    }

    var body = {
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: document.getElementById('cand-phone').value.trim() || undefined,
      postcode: document.getElementById('cand-postcode').value.trim() || undefined,
      status: document.getElementById('cand-status').value,
      notes: document.getElementById('cand-notes').value.trim() || undefined,
      roles: [{
        role: document.getElementById('cand-role').value,
        experienceLevel: document.getElementById('cand-experience').value
      }]
    };

    try {
      await AdminCore.withLoading(btn, function () {
        return fetch_('/api/v1/applications/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      });

      AdminCore.closeModal('add-candidate-modal');
      notify('Candidate added to the roster', 'success');
      onChange();
    } catch (e) {
      AdminCore.showAlert(e.message, 'error', 'add-candidate-alert');
    }
  }

  async function resendRtwRequest(applicantId, btn) {
    var detail = applicationDetails[activeDrawerAppId];
    var name = detail && detail.applicant ? detail.applicant.fullName : 'this applicant';
    if (!confirm('Re-send the right-to-work request email to ' + name + '?')) return;

    try {
      var result = await AdminCore.withLoading(btn, function () {
        return fetch_('/api/v1/admin/right-to-work/' + encodeURIComponent(applicantId) + '/request', {
          method: 'POST'
        });
      });
      notify(result && result.message ? result.message : 'Request sent', 'success');
    } catch (e) {
      notify('Could not send request: ' + e.message, 'error');
    }
  }

  async function openRtwDocument(checkId) {
    try {
      var data = await fetch_('/api/v1/admin/right-to-work/check/' + encodeURIComponent(checkId) + '/document');
      var url = data.signedUrl || data.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      notify('Could not open evidence: ' + e.message, 'error');
    }
  }

  async function loadApplicationDetail(appId) {
    var detail = await fetch_('/api/v1/applications/' + appId);
    applicationDetails[appId] = detail;
    return detail;
  }

  async function openDrawer(appId) {
    var app = findApplication(appId);
    activeDrawerAppId = appId;
    document.getElementById('drawer-name').textContent = app ? app.firstName + ' ' + app.lastName : 'Applicant';
    document.getElementById('drawer-body').innerHTML = '<div class="drawer-loading">Loading applicant details…</div>';
    document.getElementById('drawer-footer').innerHTML = '';
    document.getElementById('app-drawer-backdrop').classList.add('open');
    document.getElementById('app-drawer').classList.add('open');

    try {
      var detail = await loadApplicationDetail(appId);
      if (activeDrawerAppId === appId) {
        renderDrawer(detail);
      }
    } catch (e) {
      document.getElementById('drawer-body').innerHTML = '<div class="empty-state">Failed to load applicant details: ' + esc(e.message) + '</div>';
      notify('Failed to load applicant details: ' + e.message, 'error');
    }
  }

  function closeDrawer() {
    activeDrawerAppId = null;
    document.getElementById('app-drawer-backdrop').classList.remove('open');
    document.getElementById('app-drawer').classList.remove('open');
  }

  async function refreshOpenDrawer(appId) {
    if (!activeDrawerAppId || activeDrawerAppId !== appId) return;
    var detail = await loadApplicationDetail(appId);
    if (activeDrawerAppId === appId) {
      renderDrawer(detail);
    }
  }

  // ── Actions ─────────────────────────────────────────────
  async function updateStatus(appId, status) {
    if (status === 'REJECTED' && !confirm('Move this application to the rejected pile?')) return;
    if (status === 'HIRED' && !confirm('Mark this applicant as hired?\n\nThis emails them asking for their right-to-work evidence (share code, or an appointment to see their passport).')) return;
    try {
      var result = await fetch_('/api/v1/applications/' + appId + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      notify(
        result && result.rightToWorkRequestSent
          ? 'Hired — right-to-work request emailed'
          : 'Status updated to ' + formatApplicationStatus(status),
        'success'
      );
      await onChange();
      await refreshOpenDrawer(appId);
    } catch (e) {
      notify('Failed: ' + e.message, 'error');
    }
  }

  async function sendRosterLoginEmail(appId) {
    var app = findApplication(appId);
    var applicantName = app ? (app.firstName + ' ' + app.lastName).trim() : 'this applicant';
    if (!confirm('Send a login email with a new temporary password to ' + applicantName + '?')) return;

    try {
      var result = await fetch_('/api/v1/applications/' + appId + '/roster-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      notify(result.message || 'Roster login email sent.', 'success');
      await onChange();
      await refreshOpenDrawer(appId);
    } catch (e) {
      notify('Login email problem: ' + e.message, 'error', 7000);
      await onChange();
      await refreshOpenDrawer(appId);
    }
  }

  async function openCV(appId, cvUrl) {
    if (!cvUrl || cvUrl === 'undefined') {
      notify('No CV available', 'warning');
      return;
    }
    if (cvUrl.startsWith('http')) {
      window.open(cvUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      var resp = await fetch_('/api/v1/applications/' + appId + '/cv');
      if (resp.signedUrl) window.open(resp.signedUrl, '_blank', 'noopener,noreferrer');
      else throw new Error('No signed URL');
    } catch (e) {
      notify('Failed to open CV: ' + e.message, 'error');
    }
  }

  async function saveNotes(appId) {
    var notesEl = document.getElementById('drawer-notes');
    if (!notesEl) return;
    var notes = notesEl.value;
    if (notes === (notesEl.dataset.savedValue || '')) return;
    if (notesEl.dataset.saving === 'true') return;
    notesEl.dataset.saving = 'true';

    try {
      var updated = await fetch_('/api/v1/applications/' + appId + '/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });
      notesEl.dataset.savedValue = updated.notes || '';
      if (applicationDetails[appId]) {
        applicationDetails[appId].notes = updated.notes || '';
        applicationDetails[appId].updatedAt = updated.updatedAt || applicationDetails[appId].updatedAt;
      }
      notify('Notes saved', 'success');
      await refreshOpenDrawer(appId);
    } catch (e) {
      notify('Failed to save notes: ' + e.message, 'error');
    } finally {
      delete notesEl.dataset.saving;
    }
  }

  async function updateTier(applicantId, tier, selectEl) {
    var previousTier = selectEl.dataset.currentTier || 'STANDARD';
    selectEl.disabled = true;
    try {
      await fetch_('/api/v1/admin/staff/' + encodeURIComponent(applicantId) + '/tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tier })
      });
      selectEl.dataset.currentTier = tier;
      notify('Applicant tier updated to ' + tier, 'success');
      if (activeDrawerAppId) {
        await refreshOpenDrawer(activeDrawerAppId);
      }
    } catch (e) {
      selectEl.value = previousTier;
      notify('Failed to update tier: ' + e.message, 'error');
    } finally {
      selectEl.disabled = false;
    }
  }

  async function updateVisibility(applicantId, visible, checkboxEl) {
    checkboxEl.disabled = true;
    try {
      await fetch_('/api/v1/admin/staff/' + encodeURIComponent(applicantId) + '/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: visible })
      });
      notify('Profile visibility updated', 'success');
      if (activeDrawerAppId) {
        await refreshOpenDrawer(activeDrawerAppId);
      }
    } catch (e) {
      checkboxEl.checked = !visible;
      notify('Failed to update visibility: ' + e.message, 'error');
    } finally {
      checkboxEl.disabled = false;
    }
  }

  // ── Wiring ──────────────────────────────────────────────
  function handleClick(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'open-drawer')        return openDrawer(el.dataset.appId);
    if (action === 'close-drawer')       return closeDrawer();
    if (action === 'open-cv')            return openCV(el.dataset.appId, el.dataset.cvUrl || '');
    if (action === 'update-status')      return updateStatus(el.dataset.appId, el.dataset.status);
    if (action === 'send-roster-login')  return sendRosterLoginEmail(el.dataset.appId);
    if (action === 'save-notes')         return saveNotes(el.dataset.appId);
    if (action === 'open-rtw-modal')     return openRtwModal(el.dataset.applicantId);
    if (action === 'close-rtw-modal')    return AdminCore.closeModal('rtw-modal');
    if (action === 'submit-rtw-check')   return submitRtwCheck(el);
    if (action === 'open-rtw-document')  return openRtwDocument(el.dataset.checkId);
    if (action === 'resend-rtw-request') return resendRtwRequest(el.dataset.applicantId, el);
    if (action === 'open-add-candidate') return openAddCandidateModal();
    if (action === 'close-add-candidate-modal') return AdminCore.closeModal('add-candidate-modal');
    if (action === 'submit-add-candidate')      return submitAddCandidate(el);
  }

  function handleChange(e) {
    var tierSelect = e.target.closest('[data-action="change-tier"]');
    if (tierSelect) return updateTier(tierSelect.dataset.applicantId, tierSelect.value, tierSelect);

    var visibilityToggle = e.target.closest('[data-action="toggle-visibility"]');
    if (visibilityToggle) {
      return updateVisibility(visibilityToggle.dataset.applicantId, visibilityToggle.checked, visibilityToggle);
    }
  }

  // A page can ask for a person by id in the URL (?application=<id>), which is
  // how links from elsewhere in the panel open straight onto someone.
  function requestedApplicationId() {
    try {
      return new URLSearchParams(window.location.search).get('application');
    } catch (e) {
      return null;
    }
  }

  async function openRequestedFromUrl() {
    var id = requestedApplicationId();
    if (!id) return;
    try {
      await openDrawer(id);
    } catch (e) {
      toast('Could not open that applicant: ' + e.message, 'error');
    }
  }

  window.AdminApplicant = {
    SELECTED_STATUS: SELECTED_STATUS,

    init: function (opts) {
      opts = opts || {};
      if (typeof opts.onChange === 'function') onChange = opts.onChange;

      document.body.insertAdjacentHTML('beforeend', MARKUP);
      AdminCore.initModalBehavior('rtw-modal');
      AdminCore.initModalBehavior('add-candidate-modal');

      var backdrop = document.getElementById('app-drawer-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeDrawer);

      document.addEventListener('click', handleClick);
      document.addEventListener('change', handleChange);

      return openRequestedFromUrl();
    },

    // Called by the page each time it renders, so the drawer can name someone
    // before their record has loaded.
    setRows: function (list) { rows = list || []; },

    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    updateStatus: updateStatus,
    openAddCandidateModal: openAddCandidateModal,

    statusLabel: formatApplicationStatus,
    statusBadgeClass: applicationBadgeClass,
    statusButton: statusButton,
    renderStatusActions: renderStatusActions,
    renderRowActions: renderRowActions,
    renderRolePills: renderRolePills,
  };
}());
