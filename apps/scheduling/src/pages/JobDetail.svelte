<script lang="ts">
  import { api, gbp, shortDate } from '../lib/api';

  let { id }: { id: string } = $props();

  type Crew = {
    assignmentId: string;
    staffId: string;
    name: string;
    hours: string;
    rate?: string;
    basePay?: string;
    holidayPay?: string;
    totalCost?: string;
    warnings?: string[];
    error: string | null;
  };

  type Job = {
    id: string;
    reference: string;
    title: string;
    venueName: string | null;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    staffNeeded: number | null;
    roleNeeded: string | null;
    chargeRate: string;
    status: string;
    invoiceStatus: string;
    notes: string | null;
    scheduledHours: string;
    client: { id: string; name: string } | null;
    crew: Crew[];
    margin: {
      hours: string; charged: string; staffCost: string;
      margin: string; marginPercent: string; marginPerHour: string; thin: boolean;
    };
  };

  type Person = { id: string; firstName: string; lastName: string; hourlyRate: string | null };

  let job = $state<Job | null>(null);
  let people = $state<Person[]>([]);
  let error = $state('');
  let notice = $state('');
  let adding = $state(false);
  let bookingStaffId = $state('');

  let editing = $state(false);
  let saving = $state(false);
  let markingPaid = $state(false);
  let form = $state({
    reference: '', clientId: '', title: '', venueName: '', date: '', startTime: '', endTime: '',
    breakMinutes: 0, chargeRate: '', status: 'CONFIRMED', invoiceStatus: 'NOT_INVOICED', notes: '',
    staffNeeded: '' as number | string, roleNeeded: '',
  });

  // A job can be created without a client and given one later, so the edit
  // form needs the list too.
  let clients = $state<{ id: string; name: string }[]>([]);
  api.get<{ id: string; name: string }[]>('/api/clients?archived=false').then((c) => (clients = c));

  type Run = {
    seriesId: string;
    ongoing: boolean;
    endDate: string | null;
    repeatDays: number[];
    days: number;
    upcoming: number;
    filledTo: string | null;
  };
  let run = $state<Run | null>(null);
  let runBusy = $state(false);

  const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  async function loadRun() {
    try {
      run = (await api.get<{ run: Run | null }>(`/api/jobs/${id}/run`)).run;
    } catch {
      run = null;
    }
  }

  async function extendRun() {
    runBusy = true;
    error = '';
    try {
      const r = await api.post<{ added: number; filledTo: string | null }>(`/api/jobs/${id}/extend`);
      notice = r.added === 0
        ? 'Already filled to the end of the window.'
        : `Added ${r.added} more day${r.added === 1 ? '' : 's'}, up to ${shortDate(r.filledTo ?? '')}.`;
      await loadRun();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      runBusy = false;
    }
  }

  async function endRun(mode: 'cancel' | 'delete') {
    const what = mode === 'delete'
      ? 'Delete every future day of this run? This cannot be undone.'
      : 'Cancel every future day of this run? Days already worked are kept.';
    if (!confirm(what)) return;
    runBusy = true;
    error = '';
    try {
      const r = await api.del<{ cancelled?: number; deleted?: number }>(
        `/api/jobs/${id}/run${mode === 'delete' ? '?mode=delete' : ''}`
      );
      const n = r.cancelled ?? r.deleted ?? 0;
      notice = `${mode === 'delete' ? 'Deleted' : 'Cancelled'} ${n} day${n === 1 ? '' : 's'}.`;
      await load();
      await loadRun();
      if (mode === 'delete') window.location.hash = '#/jobs';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      runBusy = false;
    }
  }

  let duplicating = $state(false);
  let duplicateDate = $state('');
  let duplicateCrew = $state(true);

  async function load() {
    try {
      job = await api.get<Job>(`/api/jobs/${id}`);
      form = {
        reference: job.reference,
        clientId: job.client?.id ?? '',
        title: job.title,
        venueName: job.venueName ?? '',
        date: job.date.slice(0, 10),
        startTime: job.startTime,
        endTime: job.endTime,
        breakMinutes: job.breakMinutes,
        staffNeeded: job.staffNeeded ?? '',
        roleNeeded: job.roleNeeded ?? '',
        chargeRate: job.chargeRate,
        status: job.status,
        invoiceStatus: job.invoiceStatus,
        notes: job.notes ?? '',
      };
      // Default a duplicate to the next day — the usual case is a multi-day booking.
      const next = new Date(`${job.date.slice(0, 10)}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      duplicateDate = next.toISOString().slice(0, 10);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function saveJob(event: Event) {
    event.preventDefault();
    saving = true;
    error = '';
    try {
      await api.patch(`/api/jobs/${id}`, {
        ...form,
        breakMinutes: Number(form.breakMinutes),
        staffNeeded: form.staffNeeded === '' ? null : Number(form.staffNeeded),
        roleNeeded: form.roleNeeded || null,
        venueName: form.venueName || null,
        notes: form.notes || null,
      });
      editing = false;
      notice = 'Saved.';
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function duplicate() {
    saving = true;
    error = '';
    try {
      const copy = await api.post<{ id: string; reference: string; crewCopied: number }>(
        `/api/jobs/${id}/duplicate`,
        { date: duplicateDate, copyCrew: duplicateCrew }
      );
      window.location.hash = `#/jobs/${copy.id}`;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
      duplicating = false;
    }
  }

  async function deleteJob() {
    if (!confirm('Delete this job and everyone on it? This cannot be undone.')) return;
    error = '';
    try {
      await api.del(`/api/jobs/${id}`);
      window.location.hash = '#/jobs';
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function markInvoicePaid() {
    markingPaid = true;
    error = '';
    try {
      await api.patch(`/api/jobs/${id}`, { invoiceStatus: 'PAID' });
      notice = 'Invoice marked as paid.';
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      markingPaid = false;
    }
  }

  api.get<Person[]>('/api/staff?status=ACTIVE').then((p) => (people = p));
  load();
  loadRun();

  const available = $derived(
    people.filter((p) => !job?.crew.some((c) => c.staffId === p.id))
  );

  async function addPerson(staffId: string) {
    if (!staffId) return;
    adding = true;
    bookingStaffId = staffId;
    error = '';
    notice = '';
    try {
      const result = await api.post<{ warning: string | null; clash: string | null }>(
        `/api/jobs/${id}/crew`,
        { staffId }
      );
      notice = [result.clash, result.warning].filter(Boolean).join(' · ');
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      adding = false;
      bookingStaffId = '';
    }
  }

  async function updateHours(assignmentId: string, hours: string) {
    error = '';
    try {
      await api.patch(`/api/crew/${assignmentId}`, { hours });
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function remove(assignmentId: string) {
    error = '';
    try {
      await api.del(`/api/crew/${assignmentId}`);
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<div class="page-head">
  <div>
    <a href="#/jobs" style="font-size:.85rem">← All jobs</a>
    <h1 style="margin-top:.4rem">{job?.title ?? 'Job'}</h1>
    {#if job}
      <p>
        {job.reference} · {job.client?.name ?? 'No client'} · {shortDate(job.date)} ·
        {job.startTime}–{job.endTime}
        {#if job.breakMinutes}({job.breakMinutes} min break){/if}
        {#if job.venueName} · {job.venueName}{/if}
      </p>
    {/if}
  </div>
  {#if job && !editing}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      <span class="badge" style="align-self:center">{job.status}</span>
      <span class="badge {job.invoiceStatus === 'PAID' ? 'green' : job.status === 'COMPLETED' ? 'red' : 'amber'}" style="align-self:center">
        {job.invoiceStatus === 'PAID' ? 'Invoice paid' : job.status === 'COMPLETED' ? 'Invoice not paid' : job.invoiceStatus === 'INVOICED' ? 'Invoice unpaid' : 'Not invoiced'}
      </span>
      <a class="btn" href="#/jobs/{job.id}/schedule">Schedule sheet</a>
      {#if job.invoiceStatus !== 'PAID'}
        <button class="btn primary" onclick={markInvoicePaid} disabled={markingPaid}>
          {markingPaid ? 'Marking paid…' : 'Mark invoice paid'}
        </button>
      {/if}
      <button class="btn" onclick={() => (editing = true)}>Edit job</button>
      <button class="btn" onclick={() => (duplicating = !duplicating)}>Duplicate</button>
      <button class="btn danger" onclick={deleteJob}>Delete</button>
    </div>
  {/if}
</div>

{#if error}<div class="notice error" role="alert">{error}</div>{/if}
{#if notice}<div class="notice warn" role="status" aria-live="polite">{notice}</div>{/if}
{#if job?.status === 'COMPLETED' && job.invoiceStatus !== 'PAID'}
  <div class="notice error" role="status">
    <strong>Invoice not paid.</strong> Open Edit and change the invoice status once it has been paid.
  </div>
{/if}

{#if run}
  <div class="card" style="margin-bottom:1rem">
    <h2>Part of a run</h2>
    <p class="hint" style="margin-top:-.5rem">
      {run.days} day{run.days === 1 ? '' : 's'} in total, {run.upcoming} still to come.
      {#if run.repeatDays.length > 0}
        Runs {run.repeatDays.map((d) => DAY_NAMES[d]).join(', ')}.
      {/if}
      {#if run.ongoing}
        Ongoing — filled to {run.filledTo ? shortDate(run.filledTo) : 'nothing yet'}.
      {:else if run.endDate}
        Ends {shortDate(run.endDate)}.
      {/if}
    </p>

    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem">
      {#if run.ongoing}
        <button class="btn" onclick={extendRun} disabled={runBusy}>
          {runBusy ? 'Working…' : 'Fill another 8 weeks'}
        </button>
      {/if}
      <button class="btn" onclick={() => endRun('cancel')} disabled={runBusy}>
        Cancel remaining days
      </button>
      <button class="btn danger" onclick={() => endRun('delete')} disabled={runBusy}>
        Delete remaining days
      </button>
    </div>

    <p class="hint" style="margin-top:.75rem">
      Only days from today onwards are touched. Days already worked are left
      alone, because people are owed for them.
    </p>
  </div>
{/if}

{#if job && duplicating && !editing}
  <div class="card" style="margin-bottom:1rem">
    <h2>Copy this job to another day</h2>
    <div style="display:flex;gap:1rem;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="margin-bottom:0">
        <label for="dd">New date</label>
        <input id="dd" type="date" bind:value={duplicateDate} />
      </div>
      <label style="display:flex;align-items:center;gap:.5rem;margin:0 0 .5rem;cursor:pointer">
        <input type="checkbox" bind:checked={duplicateCrew} style="width:auto" />
        Bring the same {job.crew.length} {job.crew.length === 1 ? 'person' : 'people'} across
      </label>
      <button class="btn primary" onclick={duplicate} disabled={saving || !duplicateDate}>
        {saving ? 'Copying…' : 'Create copy'}
      </button>
      <button class="btn" onclick={() => (duplicating = false)}>Cancel</button>
    </div>
  </div>
{/if}

{#if !job}
  <div class="loading">Loading…</div>
{:else if editing}
  <form class="card" onsubmit={saveJob}>
    <h2>Edit job details</h2>

    <div class="field-row">
      <div class="field">
        <label for="ec">Client</label>
        <select id="ec" bind:value={form.clientId}>
          <option value="">No client</option>
          {#each clients as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="et">Job name</label>
        <input id="et" bind:value={form.title} required />
      </div>
      <div class="field">
        <label for="er">VJ reference</label>
        <input id="er" bind:value={form.reference} pattern={'VJ-[0-9]{4,}'} title="Use VJ followed by at least four digits, e.g. VJ-0042" required />
      </div>
      <div class="field">
        <label for="ev">Venue</label>
        <input id="ev" bind:value={form.venueName} />
      </div>
      <div class="field">
        <label for="es">Status</label>
        <select id="es" bind:value={form.status}>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <div class="field">
        <label for="ei">Invoice</label>
        <select id="ei" bind:value={form.invoiceStatus}>
          <option value="NOT_INVOICED">Not invoiced</option>
          <option value="INVOICED">Invoiced — unpaid</option>
          <option value="PAID">Invoice paid</option>
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="ed">Date</label>
        <input id="ed" type="date" bind:value={form.date} required />
      </div>
      <div class="field">
        <label for="est">Start</label>
        <input id="est" type="time" bind:value={form.startTime} required />
      </div>
      <div class="field">
        <label for="een">Finish</label>
        <input id="een" type="time" bind:value={form.endTime} required />
      </div>
      <div class="field">
        <label for="eb">Break (mins)</label>
        <input id="eb" type="number" min="0" max="600" bind:value={form.breakMinutes} />
      </div>
      <div class="field">
        <label for="ec">Charge rate £/hr</label>
        <input id="ec" type="number" step="0.01" min="0" bind:value={form.chargeRate} required />
      </div>
      <div class="field">
        <label for="esn">Staff needed</label>
        <input id="esn" type="number" min="0" max="999" bind:value={form.staffNeeded} placeholder="Not set" />
      </div>
      <div class="field">
        <label for="ern">Role</label>
        <input id="ern" bind:value={form.roleNeeded} placeholder="e.g. Steward" />
      </div>
    </div>

    <div class="field">
      <label for="en">Notes</label>
      <textarea id="en" bind:value={form.notes}></textarea>
    </div>

    <div style="display:flex;gap:.5rem">
      <button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" class="btn" onclick={() => { editing = false; load(); }}>Cancel</button>
    </div>
    <p class="hint" style="margin-top:.75rem">
      Changing the times doesn't change anyone's hours — those are edited per person below.
    </p>
  </form>
{:else}
  <!-- Margin first: this is the number that decides whether the job was worth doing. -->
  <div class="grid cols-3">
    <div class="card stat">
      <div class="label">Charged</div>
      <div class="value">{gbp(job.margin.charged)}</div>
      <div class="hint">{job.margin.hours} hrs @ {gbp(job.chargeRate)}</div>
    </div>
    <div class="card stat">
      <div class="label">Staff cost</div>
      <div class="value">{gbp(job.margin.staffCost)}</div>
      <div class="hint">incl. holiday pay</div>
    </div>
    <div class="card stat">
      <div class="label">Margin</div>
      <div class="value" class:gold={!job.margin.thin} style={job.margin.thin ? 'color:var(--red)' : ''}>
        {gbp(job.margin.margin)}
      </div>
      <div class="hint">{job.margin.marginPercent}% · {gbp(job.margin.marginPerHour)}/hr</div>
    </div>
  </div>

  {#if job.margin.thin}
    <div class="notice error" style="margin-top:1rem">
      Margin is under £2/hour, before employer NI. This job barely covers itself — worth
      revisiting the charge rate before the next one.
    </div>
  {/if}

  <p class="hint" style="margin-top:.75rem">
    <strong>Employer NI is not in this.</strong> Working it out needs each person's NI
    category, which comes from their age, and dates of birth live in the payroll panel now.
    Real margin is lower than shown — by roughly 15% of pay above the secondary threshold.
  </p>

  <div class="card" style="margin-top:1rem">
    <h2>Who's on this job</h2>

    {#if available.length > 0}
      <div class="quick-booking" aria-labelledby="add-person-heading">
        <div>
          <h3 id="add-person-heading">Add a person</h3>
          <p class="hint" style="margin:.15rem 0 .65rem">Choose a name to add them straight to this job.</p>
        </div>
        <div class="quick-booking-list">
          {#each available as person}
            <button
              class="btn"
              onclick={() => addPerson(person.id)}
              disabled={adding}
              aria-label={`Add ${person.firstName} ${person.lastName} to this job`}
            >
              {bookingStaffId === person.id ? 'Adding…' : `+ ${person.firstName} ${person.lastName}`}
              {#if person.hourlyRate}<span class="quick-booking-rate">£{person.hourlyRate}/hr</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if job.staffNeeded !== null}
      <div class="notice {job.crew.length < job.staffNeeded ? 'error' : ''}" style="margin-bottom:1rem">
        {job.crew.length} of {job.staffNeeded} booked{job.roleNeeded ? ` — ${job.roleNeeded}` : ''}
        {#if job.crew.length < job.staffNeeded}
          · short by {job.staffNeeded - job.crew.length}
        {/if}
      </div>
    {:else if job.roleNeeded}
      <div class="hint" style="margin-bottom:1rem">Role: {job.roleNeeded}</div>
    {/if}

    {#if job.crew.length === 0}
      <div class="empty">Nobody on this job yet.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th class="num">Hours</th><th class="num">Rate</th>
              <th class="num">Base</th><th class="num">Holiday</th><th class="num">Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each job.crew as member}
              <tr>
                <td>
                  <a href="#/staff/{member.staffId}">{member.name}</a>
                </td>
                <td class="num">
                  <input
                    class="inline"
                    style="width:70px"
                    type="number"
                    step="0.25"
                    min="0"
                    value={member.hours}
                    onchange={(e) => updateHours(member.assignmentId, e.currentTarget.value)}
                  />
                </td>
                {#if member.error}
                  <td colspan="4" style="color:var(--red)">{member.error}</td>
                {:else}
                  <td class="num">{gbp(member.rate)}</td>
                  <td class="num">{gbp(member.basePay)}</td>
                  <td class="num">{gbp(member.holidayPay)}</td>
                  <td class="num"><strong>{gbp(member.totalCost)}</strong></td>
                {/if}
                <td>
                  <button class="btn sm danger" onclick={() => remove(member.assignmentId)}>Remove</button>
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="num">{job.margin.hours}</td>
              <td colspan="3"></td>
              <td class="num">{gbp(job.margin.staffCost)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="estimate-note" style="margin-top:.75rem">
        Estimate — Basic PAYE Tools is authoritative.
      </p>
    {/if}
  </div>

  {#if job.notes}
    <div class="card">
      <h2>Notes</h2>
      <p style="white-space:pre-wrap;margin:0;color:var(--text-dim)">{job.notes}</p>
    </div>
  {/if}
{/if}
