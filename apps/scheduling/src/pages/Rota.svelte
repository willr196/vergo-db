<script lang="ts">
  /**
   * The week's rota: who is on what, and what still needs people.
   *
   * - "Shifts to fill" across the top: each job with filled / needed. Drop a
   *   person on a job to add them.
   * - People down the side, days across. Drag a name onto a job, or click an
   *   empty cell to pick that day's job. × on a shift takes them off.
   * - Click any shift for its details and crew in a side panel.
   *
   * Every change goes through the same crew routes as the job page, so the
   * board's rules hold: no hourly rate, no assignment; a clash with another job
   * the same day is warned about, not blocked.
   */
  import { api, ApiError, mondayOf, addDays, todayIso } from '../lib/api';

  type CrewMember = { assignmentId: string; staffId: string; name: string; hours: string };
  type Job = {
    id: string; reference: string; title: string;
    clientId: string | null; clientName: string | null; venueName: string | null;
    roleNeeded: string | null; staffNeeded: number | null; status: string;
    date: string; startTime: string; endTime: string;
    staffIds: string[]; crew: CrewMember[]; crewCount: number; hours: string;
  };
  type Person = { id: string; name: string; hasRate: boolean; weeklyHours: string; overWorkingTimeLimit: boolean };
  type Rota = { weekStart: string; days: string[]; staff: Person[]; jobs: Job[] };
  type Toast = { id: number; text: string; tone: 'ok' | 'warn' | 'error'; undo?: () => void };

  const WEEK_LIMIT = 48;

  let weekStart = $state(mondayOf(new Date()));
  let data = $state<Rota | null>(null);
  let loading = $state(true);
  let error = $state('');

  // Changes run one at a time, in the order they were made: a second drop
  // while the first is saving waits its turn instead of being lost, and each
  // runs against the rota as the one before left it.
  let pending = $state(0);
  const busy = $derived(pending > 0);
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue(task: () => Promise<void>) {
    pending++;
    queue = queue.then(task, task).finally(() => pending--);
    return queue;
  }

  // Filters
  let clientFilter = $state('');
  let roleFilter = $state('');
  let search = $state('');
  let onlyWorking = $state(false);

  // Interaction
  let panelJobId = $state<string | null>(null);
  let picker = $state<{ staffId: string; day: string; position: string } | null>(null);
  let dragStaffId = $state<string | null>(null);
  let dropJobId = $state<string | null>(null);
  let toasts = $state<Toast[]>([]);
  let toastSeq = 0;

  const today = todayIso();

  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = '';
    try {
      data = await api.get<Rota>(`/api/rota?weekStart=${weekStart}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    weekStart;
    panelJobId = null;
    picker = null;
    load();
  });

  const shiftWeek = (days: number) => (weekStart = addDays(weekStart, days));

  function toast(text: string, tone: Toast['tone'] = 'ok', undo?: () => void) {
    const id = ++toastSeq;
    // The latest three only: during quick work older ones would cover the grid.
    toasts = [...toasts, { id, text, tone, undo }].slice(-3);
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), undo ? 8000 : 5000);
  }

  // ── Derived views ──────────────────────────────────────────────────────

  const clients = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const j of data?.jobs ?? []) if (j.clientId && j.clientName) seen.set(j.clientId, j.clientName);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  const roles = $derived([...new Set((data?.jobs ?? []).map((j) => j.roleNeeded).filter(Boolean) as string[])].sort());

  const jobs = $derived(
    (data?.jobs ?? []).filter((j) => (!clientFilter || j.clientId === clientFilter) && (!roleFilter || j.roleNeeded === roleFilter))
  );

  const people = $derived(
    (data?.staff ?? []).filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (onlyWorking && !jobs.some((j) => j.staffIds.includes(p.id))) return false;
      return true;
    })
  );

  const panelJob = $derived(data?.jobs.find((j) => j.id === panelJobId) ?? null);

  const jobsOn = (day: string) => jobs.filter((j) => j.date === day);
  const shiftsFor = (staffId: string, day: string) => jobs.filter((j) => j.date === day && j.staffIds.includes(staffId));
  /** Any job they're on that day, filtered or not: what a clash is checked against. */
  const workingOn = (staffId: string, day: string) => (data?.jobs ?? []).filter((j) => j.date === day && j.staffIds.includes(staffId));

  function fill(job: Job): { label: string; tone: 'full' | 'short' | 'empty' | 'none' } {
    const need = job.staffNeeded ?? 0;
    if (!need) return { label: `${job.crewCount} on`, tone: job.crewCount ? 'full' : 'none' };
    if (job.crewCount >= need) return { label: `${job.crewCount}/${need}`, tone: 'full' };
    return { label: `${job.crewCount}/${need}`, tone: job.crewCount ? 'short' : 'empty' };
  }

  function daySummary(day: string) {
    const list = jobsOn(day);
    const short = list.filter((j) => fill(j).tone === 'short' || fill(j).tone === 'empty').length;
    return { count: list.length, short };
  }

  /** A steady colour per client, so the same client reads the same all week. */
  function clientHue(job: Job): number {
    const key = job.clientId ?? job.clientName ?? job.title;
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  const personById = (id: string) => data?.staff.find((p) => p.id === id);
  const hoursPct = (p: Person) => Math.min(100, (Number(p.weeklyHours) / WEEK_LIMIT) * 100);
  const isWeekend = (day: string) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const dateLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = $derived(`${dateLabel(weekStart)} – ${dateLabel(addDays(weekStart, 6))} ${weekStart.slice(0, 4)}`);

  // ── Changes ────────────────────────────────────────────────────────────

  const addToJob = (staffId: string, jobId: string) => enqueue(() => doAdd(staffId, jobId));
  const removeCrew = (assignmentId: string, quiet = false) => enqueue(() => doRemove(assignmentId, quiet));

  async function doAdd(staffId: string, jobId: string) {
    const person = personById(staffId);
    const job = data?.jobs.find((j) => j.id === jobId);
    if (!person || !job) return;
    if (job.staffIds.includes(staffId)) { toast(`${person.name} is already on ${job.title}.`, 'warn'); return; }
    if (!person.hasRate) {
      toast(`${person.name} has no hourly rate. Add one on their record first.`, 'error');
      return;
    }
    try {
      const result = await api.post<{ id: string; clash?: string | null }>(`/api/jobs/${jobId}/crew`, { staffId });
      const projected = Number(person.weeklyHours) + Number(job.hours);
      const notes = [result.clash, projected > WEEK_LIMIT ? `${person.name} is now on ${projected.toFixed(1)} hours this week (over ${WEEK_LIMIT}).` : '']
        .filter(Boolean).join(' ');
      toast(`${person.name} added to ${job.title}, ${dayLabel(job.date)} ${dateLabel(job.date)}.${notes ? ' ' + notes : ''}`,
        notes ? 'warn' : 'ok', () => removeCrew(result.id, true));
      await load(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That did not save. Try again.', 'error');
    } finally {
      picker = null;
    }
  }

  async function doRemove(assignmentId: string, quiet: boolean) {
    const job = data?.jobs.find((j) => j.crew.some((c) => c.assignmentId === assignmentId));
    const member = job?.crew.find((c) => c.assignmentId === assignmentId);
    try {
      await api.del(`/api/crew/${assignmentId}`);
      if (!quiet && job && member) {
        toast(`${member.name} taken off ${job.title}.`, 'ok', () => addToJob(member.staffId, job.id));
      } else if (quiet) {
        toast('Undone.', 'ok');
      }
      await load(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That did not save. Try again.', 'error');
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────

  function startDrag(event: DragEvent, person: Person) {
    if (!person.hasRate) { event.preventDefault(); return; }
    dragStaffId = person.id;
    event.dataTransfer?.setData('text/plain', person.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
  function endDrag() { dragStaffId = null; dropJobId = null; }
  function overJob(event: DragEvent, jobId: string) {
    if (!dragStaffId) return;
    event.preventDefault();
    dropJobId = jobId;
  }
  function dropOnJob(event: DragEvent, jobId: string) {
    event.preventDefault();
    const staffId = dragStaffId || event.dataTransfer?.getData('text/plain');
    endDrag();
    if (staffId) addToJob(staffId, jobId);
  }
  /** Dropped on a person's day: one job that day is unambiguous; more opens the picker. */
  function dropOnCell(event: DragEvent, rowStaffId: string, day: string) {
    event.preventDefault();
    const staffId = dragStaffId || event.dataTransfer?.getData('text/plain');
    endDrag();
    if (!staffId || staffId !== rowStaffId) return;
    openPicker(staffId, day, event.currentTarget as Element);
  }

  const PICKER_WIDTH = 260;
  /**
   * The picker floats over the page (position: fixed), anchored to the cell,
   * so the grid's scroll box can't cut it off on the bottom rows. It opens
   * upwards when there isn't room below, and closes on scroll rather than
   * drifting away from its cell.
   */
  function openPicker(staffId: string, day: string, anchor: Element) {
    const open = jobsOn(day).filter((j) => !j.staffIds.includes(staffId));
    if (open.length === 0) { toast(`No other jobs on ${dayLabel(day)} ${dateLabel(day)}${clientFilter || roleFilter ? ' with these filters' : ''}.`, 'warn'); return; }
    if (open.length === 1) { addToJob(staffId, open[0]!.id); return; }
    const rect = anchor.getBoundingClientRect();
    const needed = 110 + open.length * 44;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 8));
    const roomBelow = window.innerHeight - rect.bottom;
    const position = roomBelow >= needed || roomBelow >= rect.top
      ? `top: ${Math.round(rect.bottom + 4)}px; left: ${Math.round(left)}px;`
      : `bottom: ${Math.round(window.innerHeight - rect.top + 4)}px; left: ${Math.round(left)}px;`;
    picker = { staffId, day, position };
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { panelJobId = null; picker = null; }
  }
</script>

<svelte:window onkeydown={onKey} onscroll={() => (picker = null)} onresize={() => (picker = null)} />

<div class="page-head">
  <div>
    <h1>Rota</h1>
    <p>{weekLabel} · drag a name onto a shift, or click a gap in someone's row</p>
  </div>
  <div class="r-nav">
    <button class="btn" onclick={() => shiftWeek(-7)} aria-label="Previous week">←</button>
    <button class="btn" onclick={() => (weekStart = mondayOf(new Date()))}>This week</button>
    <button class="btn" onclick={() => shiftWeek(7)} aria-label="Next week">→</button>
  </div>
</div>

<div class="r-filters">
  <select bind:value={clientFilter} aria-label="Client">
    <option value="">All clients</option>
    {#each clients as c}<option value={c.id}>{c.name}</option>{/each}
  </select>
  <select bind:value={roleFilter} aria-label="Role">
    <option value="">All roles</option>
    {#each roles as r}<option value={r}>{r}</option>{/each}
  </select>
  <input type="search" placeholder="Find a person" bind:value={search} aria-label="Find a person" />
  <label class="r-check"><input type="checkbox" bind:checked={onlyWorking} /> Only people working this week</label>
</div>

{#if error}<div class="notice error">{error}</div>{/if}

{#if loading && !data}
  <div class="loading">Loading…</div>
{:else if data}
  {#if data.staff.length === 0}
    <div class="card empty">No active people yet. <a href="#/staff">Add someone</a> and they will appear here.</div>
  {:else}
    <div class="r-scroll" class:r-busy={busy} onscroll={() => (picker = null)}>
      <div class="r-grid" style="grid-template-columns: 200px repeat(7, minmax(132px, 1fr))">
        <!-- Day headings -->
        <div class="r-corner">People</div>
        {#each data.days as day}
          {@const s = daySummary(day)}
          <div class="r-dayhead" class:r-today={day === today} class:r-weekend={isWeekend(day)}>
            <span class="r-dow">{dayLabel(day)}</span>
            <span class="r-date">{dateLabel(day)}</span>
            {#if s.count}
              <span class="r-daysum" class:r-daysum-short={s.short}>{s.count} job{s.count === 1 ? '' : 's'}{s.short ? ` · ${s.short} short` : ''}</span>
            {/if}
          </div>
        {/each}

        <!-- Shifts to fill -->
        <div class="r-lane-label">
          <strong>Shifts to fill</strong>
          <span>Drop a person on a job</span>
        </div>
        {#each data.days as day}
          <div class="r-lane" class:r-today={day === today} class:r-weekend={isWeekend(day)}>
            {#each jobsOn(day) as job (job.id)}
              {@const f = fill(job)}
              <button
                type="button"
                class="r-job r-fill-{f.tone}"
                class:r-drop={dropJobId === job.id}
                style="--hue: {clientHue(job)}"
                onclick={() => (panelJobId = job.id)}
                ondragover={(e) => overJob(e, job.id)}
                ondragleave={() => (dropJobId = dropJobId === job.id ? null : dropJobId)}
                ondrop={(e) => dropOnJob(e, job.id)}
                title="{job.title} · {job.clientName ?? 'No client'} · click for details"
              >
                <span class="r-job-top">
                  <span class="r-job-title">{job.title}</span>
                  <span class="r-pill r-pill-{f.tone}">{f.label}</span>
                </span>
                <span class="r-job-meta">{job.startTime}–{job.endTime}{job.roleNeeded ? ` · ${job.roleNeeded}` : ''}</span>
                <span class="r-job-client">{job.clientName ?? 'No client'}{job.status === 'DRAFT' ? ' · draft' : ''}</span>
              </button>
            {:else}
              <span class="r-none">—</span>
            {/each}
          </div>
        {/each}

        <!-- People -->
        {#each people as person (person.id)}
          <div
            class="r-person"
            class:r-norate={!person.hasRate}
            class:r-dragging={dragStaffId === person.id}
            draggable={person.hasRate}
            ondragstart={(e) => startDrag(e, person)}
            ondragend={endDrag}
            role="listitem"
            title={person.hasRate ? 'Drag onto a shift' : 'No hourly rate: add one on their record before booking them'}
          >
            <a href="#/staff/{person.id}" class="r-person-name" draggable="false">{person.name}</a>
            <span class="r-hours" class:r-over={person.overWorkingTimeLimit} class:r-near={!person.overWorkingTimeLimit && Number(person.weeklyHours) > 40}>
              <span class="r-hours-bar"><span style="width: {hoursPct(person)}%"></span></span>
              {Number(person.weeklyHours).toFixed(1)} h{person.overWorkingTimeLimit ? ' · over 48' : ''}
            </span>
            {#if !person.hasRate}<span class="r-flag">No rate</span>{/if}
          </div>
          {#each data.days as day}
            {@const mine = shiftsFor(person.id, day)}
            <div
              class="r-cell"
              class:r-today={day === today}
              class:r-weekend={isWeekend(day)}
              ondragover={(e) => { if (dragStaffId === person.id) e.preventDefault(); }}
              ondrop={(e) => dropOnCell(e, person.id, day)}
              role="gridcell"
              tabindex="-1"
            >
              {#each mine as job (job.id)}
                {@const a = job.crew.find((c) => c.staffId === person.id)}
                <div class="r-shift" style="--hue: {clientHue(job)}">
                  <button type="button" class="r-shift-body" onclick={() => (panelJobId = job.id)} title="{job.title} · {job.clientName ?? 'No client'}">
                    <span class="r-shift-title">{job.title}</span>
                    <span class="r-shift-time">{job.startTime}–{job.endTime}</span>
                  </button>
                  {#if a}
                    <button type="button" class="r-x" onclick={() => removeCrew(a.assignmentId)} aria-label="Take {person.name} off {job.title}" title="Take off this shift">×</button>
                  {/if}
                </div>
              {/each}
              {#if mine.length > 1}<span class="r-clash" title="On more than one job this day">2 jobs</span>{/if}
              {#if person.hasRate && jobsOn(day).some((j) => !j.staffIds.includes(person.id))}
                <button type="button" class="r-add" onclick={(e) => openPicker(person.id, day, e.currentTarget)} aria-label="Add {person.name} to a job on {dayLabel(day)} {dateLabel(day)}">+</button>
              {/if}
              {#if picker && picker.staffId === person.id && picker.day === day}
                <div class="r-picker" role="dialog" aria-label="Choose a job" style={picker.position}>
                  <p>Add {person.name} to:</p>
                  {#each jobsOn(day).filter((j) => !j.staffIds.includes(person.id)) as job (job.id)}
                    {@const f = fill(job)}
                    <button type="button" class="r-pick" onclick={() => addToJob(person.id, job.id)}>
                      <span>{job.title} <small>{job.startTime}–{job.endTime}</small></span>
                      <span class="r-pill r-pill-{f.tone}">{f.label}</span>
                    </button>
                  {/each}
                  {#if workingOn(person.id, day).length}<p class="r-warn">Already on {workingOn(person.id, day).map((j) => j.title).join(', ')} that day.</p>{/if}
                  <button type="button" class="btn r-pick-cancel" onclick={() => (picker = null)}>Cancel</button>
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="r-nobody">Nobody matches. Clear the search or untick "Only people working this week".</div>
        {/each}
      </div>
    </div>

    {#if data.staff.some((s) => s.overWorkingTimeLimit)}
      <div class="notice warn" style="margin-top:1rem">
        Someone is over 48 hours this week. They'd need a signed working time opt-out.
      </div>
    {/if}
  {/if}
{/if}

<!-- Side panel: one shift -->
{#if panelJob}
  {@const f = fill(panelJob)}
  <div class="r-scrim" onclick={() => (panelJobId = null)} role="presentation"></div>
  <aside class="r-panel" aria-label="Shift details" style="--hue: {clientHue(panelJob)}">
    <div class="r-panel-head">
      <div>
        <span class="r-panel-ref">{panelJob.reference}{panelJob.status === 'DRAFT' ? ' · draft' : ''}</span>
        <h2>{panelJob.title}</h2>
      </div>
      <button class="btn" onclick={() => (panelJobId = null)} aria-label="Close">×</button>
    </div>
    <dl class="r-facts">
      <dt>When</dt><dd>{dayLabel(panelJob.date)} {dateLabel(panelJob.date)}, {panelJob.startTime}–{panelJob.endTime} ({Number(panelJob.hours).toFixed(1)} h)</dd>
      <dt>Client</dt><dd>{panelJob.clientName ?? 'No client'}</dd>
      {#if panelJob.venueName}<dt>Venue</dt><dd>{panelJob.venueName}</dd>{/if}
      {#if panelJob.roleNeeded}<dt>Role</dt><dd>{panelJob.roleNeeded}</dd>{/if}
      <dt>Crew</dt><dd><span class="r-pill r-pill-{f.tone}">{f.label}</span></dd>
    </dl>

    <h3>On this shift</h3>
    {#if panelJob.crew.length}
      <ul class="r-crew">
        {#each panelJob.crew as c (c.assignmentId)}
          <li>
            <a href="#/staff/{c.staffId}">{c.name}</a>
            <span class="r-crew-hours">{Number(c.hours).toFixed(1)} h</span>
            <button type="button" class="btn danger" onclick={() => removeCrew(c.assignmentId)} aria-label="Take {c.name} off">Remove</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="r-empty-crew">Nobody yet.</p>
    {/if}

    <h3>Add someone</h3>
    <div
      class="r-panel-drop"
      class:r-drop={dropJobId === panelJob.id}
      ondragover={(e) => overJob(e, panelJob!.id)}
      ondrop={(e) => dropOnJob(e, panelJob!.id)}
      role="list"
    >
      {#each data?.staff ?? [] as p (p.id)}
        {#if !panelJob.staffIds.includes(p.id)}
          {@const elsewhere = workingOn(p.id, panelJob.date)}
          <button type="button" class="r-cand" disabled={!p.hasRate || busy} onclick={() => addToJob(p.id, panelJob!.id)}
            title={!p.hasRate ? 'No hourly rate' : elsewhere.length ? `Also on ${elsewhere.map((j) => j.title).join(', ')} that day` : 'Add to this shift'}>
            <span>{p.name}</span>
            <small>
              {#if !p.hasRate}no rate{:else if elsewhere.length}also on {elsewhere[0]!.title}{:else}{Number(p.weeklyHours).toFixed(1)} h this week{/if}
            </small>
          </button>
        {/if}
      {/each}
    </div>
    <a class="btn r-open" href="#/jobs/{panelJob.id}">Open the full job</a>
  </aside>
{/if}

<!-- Toasts -->
<div class="r-toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="r-toast r-toast-{t.tone}">
      <span>{t.text}</span>
      {#if t.undo}
        <button type="button" onclick={() => { const u = t.undo; toasts = toasts.filter((x) => x.id !== t.id); u?.(); }}>Undo</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .r-nav { display: flex; gap: 0.4rem; }
  .r-filters { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-bottom: 1rem; }
  .r-filters select, .r-filters input[type='search'] { width: auto; min-width: 160px; }
  .r-check { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: var(--text-dim); font-size: 0.85rem; white-space: nowrap; cursor: pointer; }
  .r-check input { width: auto; margin: 0; accent-color: var(--gold); }

  .r-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
  .r-busy { cursor: progress; }
  .r-grid { display: grid; min-width: 1120px; }

  .r-corner, .r-dayhead { position: sticky; top: 0; z-index: 3; background: var(--surface-2); border-bottom: 1px solid var(--border); padding: 0.55rem 0.6rem; }
  .r-corner { left: 0; z-index: 4; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); display: flex; align-items: flex-end; }
  .r-dayhead { display: flex; flex-direction: column; gap: 1px; border-left: 1px solid var(--border); }
  .r-dow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
  .r-date { font-weight: 600; font-size: 0.95rem; }
  .r-daysum { font-size: 0.72rem; color: var(--text-faint); }
  .r-daysum-short { color: var(--amber); }
  .r-dayhead.r-today { box-shadow: inset 0 3px 0 var(--gold); }
  .r-dayhead.r-today .r-date { color: var(--gold); }

  .r-lane-label { position: sticky; left: 0; z-index: 2; background: var(--surface-2); padding: 0.6rem; border-bottom: 2px solid var(--border-bright); display: flex; flex-direction: column; gap: 2px; }
  .r-lane-label strong { font-size: 0.85rem; }
  .r-lane-label span { font-size: 0.72rem; color: var(--text-faint); }
  .r-lane { padding: 0.4rem; border-left: 1px solid var(--border); border-bottom: 2px solid var(--border-bright); display: flex; flex-direction: column; gap: 0.35rem; background: var(--surface-2); }
  .r-none { color: var(--text-faint); font-size: 0.8rem; padding: 0.3rem; }

  .r-job { text-align: left; width: 100%; display: flex; flex-direction: column; gap: 2px; padding: 0.45rem 0.5rem; border-radius: 6px; cursor: pointer; color: var(--text);
    background: hsl(var(--hue) 35% 14%); border: 1px solid hsl(var(--hue) 35% 26%); border-left: 3px solid hsl(var(--hue) 60% 55%); font: inherit; }
  .r-job:hover { border-color: hsl(var(--hue) 50% 45%); }
  .r-job:focus-visible, .r-shift-body:focus-visible, .r-add:focus-visible, .r-x:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
  .r-job.r-drop, .r-panel-drop.r-drop { outline: 2px dashed var(--gold); outline-offset: 2px; }
  .r-job-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.3rem; }
  .r-job-title { font-weight: 600; font-size: 0.82rem; line-height: 1.25; }
  .r-job-meta, .r-job-client { font-size: 0.72rem; color: var(--text-dim); }

  .r-pill { flex: none; font-family: var(--mono); font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; border: 1px solid; }
  .r-pill-full { color: var(--green); border-color: color-mix(in srgb, var(--green) 50%, transparent); }
  .r-pill-short { color: var(--amber); border-color: color-mix(in srgb, var(--amber) 50%, transparent); }
  .r-pill-empty { color: var(--red); border-color: color-mix(in srgb, var(--red) 55%, transparent); }
  .r-pill-none { color: var(--text-faint); border-color: var(--border-bright); }

  .r-person { position: sticky; left: 0; z-index: 2; background: var(--surface); padding: 0.5rem 0.6rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; cursor: grab; }
  .r-person:hover { background: var(--surface-2); }
  .r-person.r-dragging { opacity: 0.5; }
  .r-person.r-norate { cursor: not-allowed; }
  .r-person.r-norate .r-person-name { color: var(--text-dim); }
  .r-person-name { color: var(--text); font-size: 0.88rem; font-weight: 500; }
  .r-person-name:hover { color: var(--gold); text-decoration: none; }
  .r-hours { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .r-hours-bar { width: 56px; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
  .r-hours-bar span { display: block; height: 100%; background: var(--green); }
  .r-hours.r-near .r-hours-bar span { background: var(--amber); }
  .r-hours.r-over { color: var(--red); }
  .r-hours.r-over .r-hours-bar span { background: var(--red); }
  .r-flag { align-self: flex-start; font-size: 0.66rem; color: var(--amber); border: 1px solid color-mix(in srgb, var(--amber) 45%, transparent); border-radius: 4px; padding: 0 5px; }

  .r-cell { position: relative; border-top: 1px solid var(--border); border-left: 1px solid var(--border); padding: 0.35rem; min-height: 64px; display: flex; flex-direction: column; gap: 0.3rem; }
  .r-weekend { background: color-mix(in srgb, var(--surface-2) 55%, transparent); }
  .r-cell.r-today, .r-lane.r-today { background: color-mix(in srgb, var(--gold) 6%, transparent); }

  .r-shift { display: flex; align-items: stretch; border-radius: 6px; overflow: hidden; background: hsl(var(--hue) 35% 15%); border: 1px solid hsl(var(--hue) 35% 27%); border-left: 3px solid hsl(var(--hue) 60% 55%); }
  .r-shift-body { flex: 1; min-width: 0; text-align: left; background: none; border: 0; color: var(--text); padding: 0.3rem 0.4rem; cursor: pointer; font: inherit; display: flex; flex-direction: column; }
  .r-shift-title { font-size: 0.78rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .r-shift-time { font-size: 0.7rem; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .r-x { background: none; border: 0; color: var(--text-faint); padding: 0 0.45rem; cursor: pointer; font-size: 1rem; opacity: 0; }
  .r-shift:hover .r-x, .r-x:focus-visible { opacity: 1; }
  .r-x:hover { color: var(--red); }
  .r-clash { font-size: 0.66rem; color: var(--amber); }

  .r-add { align-self: flex-start; margin-top: auto; background: none; border: 1px dashed var(--border-bright); color: var(--text-faint); border-radius: 6px; width: 26px; height: 22px; line-height: 1; cursor: pointer; opacity: 0; }
  .r-cell:hover .r-add, .r-add:focus-visible { opacity: 1; }
  .r-add:hover { color: var(--gold); border-color: var(--gold-dim); }

  .r-picker { position: fixed; z-index: 30; width: 260px; max-height: calc(100vh - 16px); overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border-bright); border-radius: var(--radius); padding: 0.6rem; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 0.35rem; }
  .r-picker p { margin: 0 0 0.2rem; font-size: 0.78rem; color: var(--text-dim); }
  .r-picker .r-warn { color: var(--amber); margin-top: 0.2rem; }
  .r-pick { display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; text-align: left; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.4rem 0.5rem; cursor: pointer; font: inherit; font-size: 0.82rem; }
  .r-pick:hover { border-color: var(--gold-dim); }
  .r-pick small { color: var(--text-dim); margin-left: 0.3rem; }
  .r-pick-cancel { margin-top: 0.2rem; }
  .r-nobody { grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--text-faint); border-top: 1px solid var(--border); }

  .r-scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 40; }
  .r-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); z-index: 41; background: var(--surface); border-left: 3px solid hsl(var(--hue) 60% 55%); padding: 1.2rem; overflow-y: auto; box-shadow: -16px 0 40px rgba(0, 0, 0, 0.45); }
  .r-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .r-panel-head h2 { margin: 0.15rem 0 0; }
  .r-panel-ref { font-family: var(--mono); font-size: 0.75rem; color: var(--gold); }
  .r-panel h3 { margin: 1.3rem 0 0.5rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
  .r-facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 0.9rem; margin: 1rem 0 0; font-size: 0.9rem; }
  .r-facts dt { color: var(--text-dim); }
  .r-facts dd { margin: 0; }
  .r-crew { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .r-crew li { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; background: var(--surface-2); border-radius: 6px; }
  .r-crew li a { flex: 1; color: var(--text); }
  .r-crew-hours { font-size: 0.75rem; color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .r-empty-crew { color: var(--text-faint); font-size: 0.88rem; margin: 0; }
  .r-panel-drop { display: flex; flex-direction: column; gap: 0.3rem; max-height: 40vh; overflow-y: auto; padding: 0.2rem; border-radius: 6px; }
  .r-cand { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; text-align: left; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.45rem 0.55rem; cursor: pointer; font: inherit; font-size: 0.86rem; }
  .r-cand:hover:not(:disabled) { border-color: var(--gold-dim); }
  .r-cand:disabled { opacity: 0.5; cursor: not-allowed; }
  .r-cand small { color: var(--text-faint); font-size: 0.74rem; }
  .r-open { display: block; text-align: center; margin-top: 1.2rem; }

  .r-toasts { position: fixed; right: 1rem; bottom: 1rem; z-index: 60; display: flex; flex-direction: column; gap: 0.5rem; max-width: min(420px, calc(100vw - 2rem)); }
  .r-toast { display: flex; align-items: center; gap: 0.8rem; padding: 0.65rem 0.8rem; border-radius: var(--radius); background: var(--surface-2); border: 1px solid var(--border-bright); border-left: 3px solid var(--green); font-size: 0.86rem; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); }
  .r-toast-warn { border-left-color: var(--amber); }
  .r-toast-error { border-left-color: var(--red); }
  .r-toast span { flex: 1; }
  .r-toast button { background: none; border: 1px solid var(--border-bright); color: var(--gold); border-radius: 6px; padding: 0.2rem 0.55rem; cursor: pointer; font: inherit; font-size: 0.8rem; }

  @media (max-width: 700px) {
    .r-filters select, .r-filters input[type='search'] { flex: 1 1 140px; min-width: 0; }
    .r-grid { grid-template-columns: 140px repeat(7, minmax(128px, 1fr)) !important; }
    .r-add, .r-x { opacity: 1; }
  }
</style>
