<script lang="ts">
  import { api, gbp, shortDate } from '../lib/api';

  let { id }: { id: string } = $props();

  type Detail = {
    id: string;
    firstName: string; lastName: string;
    email: string | null; phone: string | null;
    hourlyRate: string | null; status: string; notes: string | null;
    rate: { base: string; holiday: string; allIn: string } | null;
    assignments: {
      id: string; hours: string;
      job: { id: string; reference: string; title: string; date: string; client: { name: string } | null };
    }[];
  };

  type OpenJob = {
    id: string;
    reference: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    client: { name: string } | null;
    crewCount: number;
  };

  let person = $state<Detail | null>(null);
  let openJobs = $state<OpenJob[]>([]);
  let error = $state('');
  let notice = $state('');
  let saving = $state(false);
  let bookingJobId = $state('');
  let editing = $state(false);

  let form = $state({
    firstName: '', lastName: '', email: '', phone: '',
    hourlyRate: '', status: 'ACTIVE', notes: '',
  });

  async function load() {
    try {
      person = await api.get<Detail>(`/api/staff/${id}`);
      openJobs = await api.get<OpenJob[]>(`/api/staff/${id}/open-jobs`);
      form = {
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email ?? '',
        phone: person.phone ?? '',
        hourlyRate: person.hourlyRate ?? '',
        status: person.status,
        notes: person.notes ?? '',
      };
    } catch (e) {
      error = (e as Error).message;
    }
  }
  load();

  async function addToJob(job: OpenJob) {
    if (!person) return;
    bookingJobId = job.id;
    error = '';
    notice = '';
    try {
      const result = await api.post<{ warning: string | null; clash: string | null }>(
        `/api/jobs/${job.id}/crew`,
        { staffId: person.id }
      );
      notice = [result.clash, result.warning].filter(Boolean).join(' · ') || `Added to ${job.reference}.`;
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      bookingJobId = '';
    }
  }

  // The two figures that always belong together: what you type, and what it
  // actually costs once holiday pay goes on top.
  const preview = $derived.by(() => {
    const rate = Number(form.hourlyRate);
    if (!rate || Number.isNaN(rate)) return null;
    const holiday = rate * 0.1207;
    return { base: rate.toFixed(2), holiday: holiday.toFixed(2), allIn: (rate + holiday).toFixed(2) };
  });

  async function save(event: Event) {
    event.preventDefault();
    saving = true;
    error = '';
    notice = '';
    try {
      const result = await api.patch<{ warning: string | null }>(`/api/staff/${id}`, {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
        hourlyRate: form.hourlyRate || null,
        notes: form.notes || null,
      });
      notice = result.warning ?? 'Saved.';
      editing = false;
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page-head">
  <div>
    <a href="#/staff" style="font-size:.85rem">← All people</a>
    <h1 style="margin-top:.4rem">
      {person ? `${person.firstName} ${person.lastName}` : 'Person'}
    </h1>
    {#if person}
      <p>
        {person.rate ? `£${person.rate.allIn}/hr all-in` : 'No rate set'} ·
        {person.status === 'ACTIVE' ? 'Active' : 'Inactive'}
      </p>
    {/if}
  </div>
  {#if person && !editing}
    <button class="btn" onclick={() => (editing = true)}>Edit</button>
  {/if}
</div>

{#if error}<div class="notice error" role="alert">{error}</div>{/if}
{#if notice}<div class="notice warn" role="status" aria-live="polite">{notice}</div>{/if}

{#if !person}
  <div class="loading">Loading…</div>
{:else if editing}
  <form class="card" onsubmit={save}>
    <div class="field-row">
      <div class="field">
        <label for="fn">First name</label>
        <input id="fn" bind:value={form.firstName} required />
      </div>
      <div class="field">
        <label for="ln">Last name</label>
        <input id="ln" bind:value={form.lastName} required />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="hr">Hourly rate £</label>
        <input id="hr" type="number" step="0.01" min="0" bind:value={form.hourlyRate} />
        {#if preview}
          <div class="hint gold">
            £{preview.base} + £{preview.holiday} holiday = <strong>£{preview.allIn}/hr</strong> all in
          </div>
        {:else}
          <div class="hint">Holiday pay is added on top.</div>
        {/if}
      </div>
      <div class="field">
        <label for="st">Status</label>
        <select id="st" bind:value={form.status}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="em">Email (optional)</label>
        <input id="em" type="email" bind:value={form.email} />
      </div>
      <div class="field">
        <label for="ph">Phone (optional)</label>
        <input id="ph" bind:value={form.phone} />
      </div>
    </div>

    <div class="field">
      <label for="no">Notes</label>
      <textarea id="no" bind:value={form.notes}></textarea>
    </div>

    <div style="display:flex;gap:.5rem">
      <button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" class="btn" onclick={() => { editing = false; load(); }}>Cancel</button>
    </div>
  </form>
{:else}
  <div class="grid cols-2">
    <div class="card">
      <h2>Cost</h2>
      {#if person.rate}
        <div class="grid cols-2" style="gap:.5rem">
          <div class="stat">
            <div class="label">Base rate</div>
            <div class="value">£{person.rate.base}</div>
          </div>
          <div class="stat">
            <div class="label">All-in cost</div>
            <div class="value gold">£{person.rate.allIn}</div>
            <div class="hint">incl. £{person.rate.holiday} holiday</div>
          </div>
        </div>
      {:else}
        <div class="notice error" style="margin:0">
          No rate set — they can't be put on a job until there is one.
        </div>
      {/if}

      <p class="hint" style="margin-top:1rem">
        This is what they cost you, not what they take home. Tax, National
        Insurance and student loan are worked out in the payroll panel.
      </p>
    </div>

    <div class="card">
      <h2>Details</h2>
      <div style="color:var(--text-dim);font-size:.875rem;line-height:1.9">
        <div>Email · {person.email ?? '—'}</div>
        <div>Phone · {person.phone ?? '—'}</div>
        <div>Status · {person.status}</div>
      </div>
      {#if person.notes}
        <p style="white-space:pre-wrap;margin:.75rem 0 0;color:var(--text-dim);font-size:.875rem">
          {person.notes}
        </p>
      {/if}
    </div>
  </div>


  <div class="card">
    <h2>Book onto a shift</h2>
    {#if person.status !== 'ACTIVE'}
      <div class="notice info" style="margin:0">Make this person active before booking them onto a shift.</div>
    {:else if !person.rate}
      <div class="notice info" style="margin:0">Set an hourly rate before booking them onto a shift.</div>
    {:else if openJobs.length === 0}
      <div class="empty">No upcoming shifts are available to book.</div>
    {:else}
      <p class="hint" style="margin-top:-.5rem">Choose a shift to add {person.firstName} without leaving this page.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Ref</th><th>Shift</th><th>Client</th><th>Date</th><th>Time</th><th class="num">Crew</th><th></th></tr>
          </thead>
          <tbody>
            {#each openJobs as job}
              <tr>
                <td><a href="#/jobs/{job.id}">{job.reference}</a></td>
                <td>{job.title}</td>
                <td>{job.client?.name ?? '—'}</td>
                <td>{shortDate(job.date)}</td>
                <td>{job.startTime}–{job.endTime}</td>
                <td class="num">{job.crewCount}</td>
                <td>
                  <button
                    class="btn sm primary"
                    onclick={() => addToJob(job)}
                    disabled={bookingJobId !== ''}
                    aria-label={`Add ${person.firstName} ${person.lastName} to ${job.reference}, ${job.title}`}
                  >
                    {bookingJobId === job.id ? 'Adding…' : 'Add'}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <div class="card">
    <h2>Booked shifts</h2>
    {#if person.assignments.length === 0}
      <div class="empty">Not on any jobs yet.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Ref</th><th>Job</th><th>Client</th><th>Date</th><th class="num">Hours</th></tr>
          </thead>
          <tbody>
            {#each person.assignments as a}
              <tr>
                <td><a href="#/jobs/{a.job.id}">{a.job.reference}</a></td>
                <td>{a.job.title}</td>
                <td>{a.job.client?.name ?? '—'}</td>
                <td>{shortDate(a.job.date)}</td>
                <td class="num">{a.hours}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/if}
