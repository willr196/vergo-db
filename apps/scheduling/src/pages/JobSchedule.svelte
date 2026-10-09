<script lang="ts">
  import { api, shortDate } from '../lib/api';

  let { id }: { id: string } = $props();

  type ScheduleItem = {
    id: string;
    time: string | null;
    title: string;
    assignee: string | null;
    notes: string | null;
  };
  type JobSchedule = {
    id: string;
    reference: string;
    title: string;
    venueName: string | null;
    date: string;
    startTime: string;
    endTime: string;
    client: { id: string; name: string } | null;
    crew: { id: string; name: string }[];
    scheduleItems: ScheduleItem[];
  };

  let job = $state<JobSchedule | null>(null);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let saving = $state(false);
  let editingId = $state<string | null>(null);
  let form = $state({ time: '', title: '', assignee: '', notes: '' });

  async function load() {
    loading = true;
    try {
      job = await api.get<JobSchedule>(`/api/jobs/${id}/schedule`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function clearForm() {
    form = { time: '', title: '', assignee: '', notes: '' };
    editingId = null;
  }

  function edit(item: ScheduleItem) {
    form = {
      time: item.time ?? '', title: item.title, assignee: item.assignee ?? '', notes: item.notes ?? '',
    };
    editingId = item.id;
    notice = '';
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = '';
    notice = '';
    try {
      const body = { ...form };
      if (editingId) {
        await api.patch(`/api/schedule-items/${editingId}`, body);
        notice = 'Schedule item updated.';
      } else {
        await api.post(`/api/jobs/${id}/schedule-items`, body);
        notice = 'Schedule item added.';
      }
      clearForm();
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function remove(item: ScheduleItem) {
    if (!confirm(`Remove “${item.title}” from this schedule?`)) return;
    error = '';
    notice = '';
    try {
      await api.del(`/api/schedule-items/${item.id}`);
      if (editingId === item.id) clearForm();
      await load();
      notice = 'Schedule item removed.';
    } catch (e) {
      error = (e as Error).message;
    }
  }

  load();
</script>

{#if loading}
  <div class="loading">Loading schedule sheet…</div>
{:else if job}
  <div class="page-head no-print">
    <div>
      <a href="#/jobs/{job.id}" style="font-size:.85rem">← Back to job</a>
      <h1 style="margin-top:.4rem">Schedule sheet</h1>
      <p>{job.reference} · {job.title}</p>
    </div>
    <button class="btn" onclick={() => window.print()}>Print</button>
  </div>

  <div class="print-only print-head">
    <h1>{job.title} — Schedule sheet</h1>
    <p>{job.reference} · {shortDate(job.date)} · {job.startTime}–{job.endTime}</p>
  </div>

  {#if error}<div class="notice error" role="alert">{error}</div>{/if}
  {#if notice}<div class="notice warn" role="status">{notice}</div>{/if}

  <div class="card schedule-summary">
    <div><span>Client</span><strong>{job.client?.name ?? 'No client'}</strong></div>
    <div><span>Date & time</span><strong>{shortDate(job.date)} · {job.startTime}–{job.endTime}</strong></div>
    <div><span>Venue</span><strong>{job.venueName ?? 'Not set'}</strong></div>
    <div><span>Crew</span><strong>{job.crew.length ? job.crew.map((person) => person.name).join(', ') : 'Nobody assigned yet'}</strong></div>
  </div>

  <div class="card no-print">
    <h2>{editingId ? 'Edit schedule item' : 'Add to schedule'}</h2>
    <form onsubmit={save}>
      <div class="field-row schedule-form-row">
        <div class="field">
          <label for="schedule-time">Time</label>
          <input id="schedule-time" type="time" bind:value={form.time} />
        </div>
        <div class="field" style="flex:2">
          <label for="schedule-item">What is happening</label>
          <input id="schedule-item" bind:value={form.title} placeholder="e.g. Crew briefing" required />
        </div>
        <div class="field">
          <label for="schedule-owner">Who</label>
          <input id="schedule-owner" bind:value={form.assignee} placeholder="Optional" />
        </div>
      </div>
      <div class="field">
        <label for="schedule-notes">Notes</label>
        <textarea id="schedule-notes" bind:value={form.notes} placeholder="Optional instructions, contacts or details"></textarea>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to schedule'}</button>
        {#if editingId}<button type="button" class="btn" onclick={clearForm}>Cancel</button>{/if}
      </div>
    </form>
  </div>

  <div class="card schedule-sheet">
    <h2>Running order</h2>
    {#if job.scheduleItems.length === 0}
      <div class="empty">Nothing on this schedule yet. Add arrivals, briefings, doors, breaks and pack-down above.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead><tr><th class="schedule-time">Time</th><th>Schedule</th><th>Who</th><th>Notes</th><th class="no-print"></th></tr></thead>
          <tbody>
            {#each job.scheduleItems as item}
              <tr>
                <td class="schedule-time">{item.time ?? '—'}</td>
                <td><strong>{item.title}</strong></td>
                <td>{item.assignee ?? '—'}</td>
                <td class="schedule-notes">{item.notes ?? '—'}</td>
                <td class="no-print" style="white-space:nowrap">
                  <button class="btn sm" onclick={() => edit(item)}>Edit</button>
                  <button class="btn sm danger" onclick={() => remove(item)}>Remove</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{:else}
  {#if error}<div class="notice error">{error}</div>{/if}
{/if}

<style>
  .schedule-summary { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1rem; }
  .schedule-summary span { display:block; color:var(--text-dim); font-size:.78rem; text-transform:uppercase; letter-spacing:.05em; margin-bottom:.2rem; }
  .schedule-summary strong { font-size:.9rem; font-weight:500; }
  .schedule-form-row { grid-template-columns:minmax(115px, .5fr) minmax(200px, 2fr) minmax(160px, 1fr); }
  .schedule-time { width:100px; font-family:var(--mono); font-variant-numeric:tabular-nums; white-space:nowrap; }
  .schedule-notes { white-space:pre-wrap; color:var(--text-dim); }
  @media (max-width: 700px) { .schedule-form-row { grid-template-columns:1fr; } }
</style>
