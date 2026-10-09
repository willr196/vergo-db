<script lang="ts">
  import { api, gbp, shortDate, todayIso } from '../lib/api';
  import { navigate } from '../lib/router.svelte';
  import MonthGrid from '../lib/MonthGrid.svelte';
  import { shiftMonth } from '../lib/month';

  type Job = {
    id: string;
    reference: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    chargeRate: string;
    status: string;
    invoiceStatus: string;
    scheduledHours: string;
    crewCount: number;
    /** What the event asked for. Null means nobody has said yet. */
    staffNeeded: number | null;
    roleNeeded: string | null;
    client: { id: string; name: string } | null;
    /** Set when this day is part of a run. Every day of a run shares it. */
    seriesId: string | null;
  };
  type Client = { id: string; name: string; defaultChargeRate: string | null };

  let jobs = $state<Job[]>([]);
  let clients = $state<Client[]>([]);
  let error = $state('');
  let loading = $state(true);

  let statusFilter = $state('');
  let clientFilter = $state('');
  let fromDate = $state('');
  let toDate = $state('');
  let searchTerm = $state('');
  let roleFilter = $state('');
  let crewFilter = $state('');
  // The board reads forward by default. Flipping it is occasionally useful
  // for looking back over what has just been and gone.
  let sortOrder = $state<'asc' | 'desc'>('asc');

  let showForm = $state(false);
  let saving = $state(false);
  let formError = $state('');
  let payingId = $state('');

  const blank = () => ({
    clientId: '',
    title: '',
    venueName: '',
    date: todayIso(),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    chargeRate: '',
    staffNeeded: '',
    roleNeeded: '',
    status: 'CONFIRMED',
    invoiceStatus: 'NOT_INVOICED',
    notes: '',
    // A run. 'once' is the ordinary single day and stays the default.
    repeat: 'once' as 'once' | 'selected' | 'until' | 'ongoing',
    endDate: '',
    repeatDays: [1, 2, 3, 4, 5] as number[],
    // Separate, non-consecutive days for one client booking. Notes are kept
    // alongside the date because each day becomes its own normal rota job.
    selectedDates: [{ date: todayIso(), notes: '' }],
  });
  let form = $state(blank());

  const WEEKDAYS = [
    { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
    { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' },
    { n: 7, label: 'Sun' },
  ];

  function toggleDay(n: number) {
    form.repeatDays = form.repeatDays.includes(n)
      ? form.repeatDays.filter((d) => d !== n)
      : [...form.repeatDays, n].sort((a, b) => a - b);
  }

  function addSelectedDate() {
    form.selectedDates = [...form.selectedDates, { date: todayIso(), notes: '' }];
  }

  function removeSelectedDate(index: number) {
    if (form.selectedDates.length === 1) return;
    form.selectedDates = form.selectedDates.filter((_, i) => i !== index);
  }

  function updateSelectedDate(index: number, field: 'date' | 'notes', value: string) {
    form.selectedDates = form.selectedDates.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    );
  }

  // Roughly how many days the run will create, so the count is visible before
  // committing to it rather than after forty jobs appear.
  const runPreview = $derived.by(() => {
    if (form.repeat === 'once' || form.repeat === 'selected' || !form.date) return null;
    const start = new Date(`${form.date}T00:00:00Z`);
    const last = form.repeat === 'ongoing'
      ? new Date(start.getTime() + 56 * 86400000)
      : form.endDate ? new Date(`${form.endDate}T00:00:00Z`) : null;
    if (!last || last < start) return null;
    let count = 0;
    for (let d = new Date(start); d <= last && count <= 401; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      if (form.repeatDays.length === 0 || form.repeatDays.includes(iso)) count++;
    }
    return count;
  });

  const statusTone: Record<string, string> = {
    DRAFT: '',
    CONFIRMED: 'gold',
    COMPLETED: 'green',
    CANCELLED: 'red',
  };

  const invoiceLabel: Record<string, string> = {
    NOT_INVOICED: 'Not invoiced',
    INVOICED: 'Invoice unpaid',
    PAID: 'Invoice paid',
  };
  const invoiceTone: Record<string, string> = {
    NOT_INVOICED: 'amber',
    INVOICED: 'amber',
    PAID: 'green',
  };

  function invoiceText(job: Job) {
    return job.status === 'COMPLETED' && job.invoiceStatus !== 'PAID'
      ? 'Invoice not paid'
      : (invoiceLabel[job.invoiceStatus] ?? 'Not invoiced');
  }

  function invoiceClass(job: Job) {
    return job.status === 'COMPLETED' && job.invoiceStatus !== 'PAID'
      ? 'red'
      : (invoiceTone[job.invoiceStatus] ?? 'amber');
  }

  // Crew reads as "have/needed" once a target is set, and plain when it is
  // not. Short of the target is the thing worth noticing, so it is red.
  function crewLabel(job: Job) {
    return job.staffNeeded === null ? `${job.crewCount}` : `${job.crewCount}/${job.staffNeeded}`;
  }

  function crewShort(job: Job) {
    return job.staffNeeded !== null && job.crewCount < job.staffNeeded;
  }

  // A run row totals its days, so its target totals its days too. Days with
  // no target contribute nothing to the target but still contribute crew,
  // which is why a run only claims a target when at least one day sets one.
  function runCrewLabel(days: Job[]) {
    const have = days.reduce((n, d) => n + d.crewCount, 0);
    const needed = days.reduce((n, d) => n + (d.staffNeeded ?? 0), 0);
    return days.some((d) => d.staffNeeded !== null) ? `${have}/${needed}` : `${have}`;
  }

  function runShort(days: Job[]) {
    return days.some(crewShort);
  }

  function unpaidCompletedCount(jobs: Job[]) {
    return jobs.filter((job) => job.status === 'COMPLETED' && job.invoiceStatus !== 'PAID').length;
  }

  async function load() {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (clientFilter) params.set('clientId', clientFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (roleFilter) params.set('role', roleFilter);
      if (crewFilter) params.set('crew', crewFilter);
      // This board is work still to come, so the next job to run is the top
      // row, unless you have asked to look the other way.
      params.set('order', sortOrder);
      jobs = await api.get<Job[]>(`/api/jobs?${params}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  api.get<Client[]>('/api/clients?archived=false').then((c) => (clients = c));

  // Roles you have asked for before, offered as suggestions so the same
  // job title does not get typed three different ways.
  let roleOptions = $state<string[]>([]);
  api.get<string[]>('/api/jobs/roles').then((r) => (roleOptions = r)).catch(() => {});

  // No eager load(): the effect below runs on mount too, and calling both
  // fetched the whole job list twice on every visit to this page.
  $effect(() => {
    statusFilter;
    clientFilter;
    fromDate;
    toDate;
    roleFilter;
    crewFilter;
    sortOrder;
    // Typing in the search box would otherwise fire a request per
    // keystroke, so the term is read on a short delay and the timer is
    // cleared if another change lands first.
    searchTerm;
    const timer = setTimeout(load, searchTerm ? 250 : 0);
    return () => clearTimeout(timer);
  });

  const filtered = $derived(
    Boolean(statusFilter || clientFilter || fromDate || toDate || searchTerm.trim() || roleFilter || crewFilter)
  );

  // This board is work still to do or still to finish. A job leaves it in one
  // of two directions, and neither deletes anything: paid goes to Completed,
  // completed-but-unpaid goes to Awaiting payment, where the invoice is
  // chased. Filtering by status is the one exception — asking for completed
  // jobs should show them.
  const visibleJobs = $derived(
    jobs.filter(
      (job) =>
        statusFilter === 'COMPLETED' ||
        (job.invoiceStatus !== 'PAID' && job.status !== 'COMPLETED')
    )
  );

  // ── Calendar ────────────────────────────────────────────────────────────
  // The list is the default: it folds a run into one row and a client's runs
  // under one header, so long bookings do not crowd out the rest. The
  // calendar is a click away for a month at a glance.
  let view = $state<'calendar' | 'list'>('list');
  let month = $state(todayIso().slice(0, 7) + '-01');
  let selectedDay = $state<string | null>(todayIso());

  function goMonth(by: number) {
    month = shiftMonth(month, by);
    selectedDay = null;
  }

  function thisMonth() {
    month = todayIso().slice(0, 7) + '-01';
    selectedDay = todayIso();
  }

  const monthLabel = $derived(
    new Date(`${month}T00:00:00Z`).toLocaleDateString('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    })
  );

  const dayJobs = $derived(
    selectedDay ? visibleJobs.filter((j) => j.date.slice(0, 10) === selectedDay) : []
  );

  // ── Run grouping for the list ───────────────────────────────────────────
  // One row per run rather than one per day, expandable. A standalone job is
  // its own group of one, so the list renders the same way either way.
  let expandedRuns = $state<Record<string, boolean>>({});

  type Group = {
    key: string;
    lead: Job;
    days: Job[];
    isRun: boolean;
  };

  const groups = $derived.by(() => {
    const out: Group[] = [];
    const runs = new Map<string, Group>();
    for (const job of visibleJobs) {
      if (!job.seriesId) {
        out.push({ key: job.id, lead: job, days: [job], isRun: false });
        continue;
      }
      const existing = runs.get(job.seriesId);
      if (existing) {
        existing.days.push(job);
        // The list is soonest first, so the first day of a run leads it. Guard
        // anyway rather than lean on the query's order.
        if (job.date < existing.lead.date) existing.lead = job;
      } else {
        const group = { key: job.seriesId, lead: job, days: [job], isRun: true };
        runs.set(job.seriesId, group);
        out.push(group);
      }
    }
    return out;
  });

  const runSpan = (g: { days: Job[] }) => {
    const dates = g.days.map((d) => d.date.slice(0, 10)).sort();
    return { from: dates[0]!, to: dates[dates.length - 1]! };
  };

  // ── Client grouping for the list ────────────────────────────────────────
  // A client with more than one day on the board (POPCORN's weekday kitchen
  // porters) is one header row, closed by default, so its days do not push
  // everyone else's jobs down the page. Opened, it shows its jobs and runs as
  // above. A client with a single job, and jobs with no client, stay as they
  // are. The header sits where the client's first job would have.
  let expandedClients = $state<Record<string, boolean>>({});

  type ClientGroup = {
    key: string;
    name: string;
    groups: Group[];
    days: Job[];
  };

  const clientGroups = $derived.by(() => {
    const out: (ClientGroup | Group)[] = [];
    const byClient = new Map<string, ClientGroup>();
    for (const group of groups) {
      const client = group.lead.client;
      if (!client) {
        out.push(group);
        continue;
      }
      const existing = byClient.get(client.id);
      if (existing) {
        existing.groups.push(group);
        existing.days.push(...group.days);
      } else {
        const entry = { key: client.id, name: client.name, groups: [group], days: [...group.days] };
        byClient.set(client.id, entry);
        out.push(entry);
      }
    }
    // A client with only one day has nothing to fold away.
    return out.map((g) => ('groups' in g && g.days.length === 1 ? g.groups[0]! : g));
  });

  const isClientGroup = (g: ClientGroup | Group): g is ClientGroup => 'groups' in g;

  function clearFilters() {
    statusFilter = '';
    clientFilter = '';
    fromDate = '';
    toDate = '';
    searchTerm = '';
    roleFilter = '';
    crewFilter = '';
  }

  async function deleteJob(event: MouseEvent, job: Job) {
    event.stopPropagation();
    if (!confirm(`Delete ${job.reference} and everyone assigned to it? This cannot be undone.`)) return;
    error = '';
    try {
      await api.del(`/api/jobs/${job.id}`);
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function renameJob(event: MouseEvent, job: Job) {
    event.stopPropagation();
    const answer = prompt('Job name', job.title);
    if (answer === null) return;
    const title = answer.trim();
    if (!title) {
      error = 'A job name is required.';
      return;
    }
    if (title === job.title) return;
    error = '';
    try {
      await api.patch(`/api/jobs/${job.id}`, { title });
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function markInvoicePaid(event: MouseEvent, job: Job) {
    event.stopPropagation();
    payingId = job.id;
    error = '';
    try {
      await api.patch(`/api/jobs/${job.id}`, { invoiceStatus: 'PAID' });
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      payingId = '';
    }
  }

  // Picking a client pre-fills their usual rate, which is the whole point of
  // storing one.
  function onClientChange() {
    const client = clients.find((c) => c.id === form.clientId);
    if (client?.defaultChargeRate && !form.chargeRate) {
      form.chargeRate = client.defaultChargeRate;
    }
  }

  function openForm() {
    form = blank();
    formError = '';
    showForm = true;
  }

  async function save(event: Event) {
    event.preventDefault();
    saving = true;
    formError = '';
    try {
      const { repeat, endDate, repeatDays, selectedDates, ...fields } = form;
      const created = await api.post<{ id: string }>('/api/jobs', {
        ...fields,
        breakMinutes: Number(fields.breakMinutes),
        // Blank means not said yet, which is null rather than nought.
        staffNeeded: fields.staffNeeded === '' ? null : Number(fields.staffNeeded),
        roleNeeded: fields.roleNeeded || null,
        venueName: fields.venueName || null,
        notes: fields.notes || null,
        endDate: repeat === 'until' ? endDate : null,
        ongoing: repeat === 'ongoing',
        // Only meaningful for a run; a single day covers exactly its own date.
        repeatDays: repeat === 'once' ? [] : repeatDays,
        selectedDates: repeat === 'selected'
          ? selectedDates.map((entry) => ({ date: entry.date, notes: entry.notes || null }))
          : undefined,
      });
      showForm = false;
      navigate(`jobs/${created.id}`);
    } catch (e) {
      formError = (e as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>Jobs</h1>
    <p>One job is one day's work for one client.</p>
  </div>
  <div style="display:flex;gap:.5rem;align-items:center">
    <div style="display:flex;gap:.25rem">
      <button class="btn sm" class:primary={view === 'calendar'} onclick={() => (view = 'calendar')}>
        Calendar
      </button>
      <button class="btn sm" class:primary={view === 'list'} onclick={() => (view = 'list')}>
        List
      </button>
    </div>
    <button class="btn primary" onclick={openForm}>
      Add job
    </button>
  </div>
</div>

{#if error}<div class="notice error">{error}</div>{/if}

{#if showForm}
  <form class="card" onsubmit={save} style="margin-bottom:1rem">
    <h2>New job</h2>
    {#if formError}<div class="notice error">{formError}</div>{/if}

    <div class="field-row">
      <div class="field">
        <label for="c">Client</label>
        <select id="c" bind:value={form.clientId} onchange={onClientChange}>
          <option value="">No client</option>
          {#each clients as client}<option value={client.id}>{client.name}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="t">Job name</label>
        <input id="t" bind:value={form.title} placeholder="Corporate dinner" required />
      </div>
      <div class="field">
        <label for="i">Invoice</label>
        <select id="i" bind:value={form.invoiceStatus}>
          <option value="NOT_INVOICED">Not invoiced</option>
          <option value="INVOICED">Invoiced — unpaid</option>
          <option value="PAID">Invoice paid</option>
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="v">Venue</label>
        <input id="v" bind:value={form.venueName} placeholder="Optional" />
      </div>
      {#if form.repeat !== 'selected'}
      <div class="field">
        <label for="d">Date</label>
        <input id="d" type="date" bind:value={form.date} required />
      </div>
      {/if}
    </div>

    <div class="field-row">
      <div class="field">
        <label for="s">Start</label>
        <input id="s" type="time" bind:value={form.startTime} required />
      </div>
      <div class="field">
        <label for="e">Finish</label>
        <input id="e" type="time" bind:value={form.endTime} required />
      </div>
      <div class="field">
        <label for="b">Break (mins)</label>
        <input id="b" type="number" min="0" max="600" bind:value={form.breakMinutes} />
      </div>
      <div class="field">
        <label for="r">Charge rate £/hr</label>
        <input id="r" type="number" step="0.01" min="0" bind:value={form.chargeRate} required />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="sn">Staff needed (optional)</label>
        <input id="sn" type="number" min="0" max="999" bind:value={form.staffNeeded} placeholder="Not set" />
      </div>
      <div class="field">
        <label for="rn">Role (optional)</label>
        <input id="rn" list="role-options" bind:value={form.roleNeeded} placeholder="e.g. Steward" />
        <datalist id="role-options">
          {#each roleOptions as role}<option value={role}></option>{/each}
        </datalist>
      </div>
    </div>

    <div class="field">
      <label for="rep">How long</label>
      <select id="rep" bind:value={form.repeat}>
        <option value="once">Just this day</option>
        <option value="selected">Choose separate dates</option>
        <option value="until">Runs until a date</option>
        <option value="ongoing">Ongoing — no end yet</option>
      </select>
    </div>

    {#if form.repeat === 'selected'}
      <div class="field">
        <span class="field-label">Dates and notes</span>
        <p class="hint" style="margin:.2rem 0 .65rem">
          Add each date for this booking. Every date will show as its own normal job in the rota,
          linked to the client selected above.
        </p>
        {#each form.selectedDates as entry, index}
          <div class="field-row" style="align-items:end;margin-bottom:.5rem">
            <div class="field" style="margin-bottom:0">
              <label for={`sd-${index}`}>Date {index + 1}</label>
              <input
                id={`sd-${index}`}
                type="date"
                value={entry.date}
                oninput={(event) => updateSelectedDate(index, 'date', event.currentTarget.value)}
                required
              />
            </div>
            <div class="field" style="margin-bottom:0;flex:2">
              <label for={`sn-${index}`}>Note for this date</label>
              <input
                id={`sn-${index}`}
                value={entry.notes}
                oninput={(event) => updateSelectedDate(index, 'notes', event.currentTarget.value)}
                placeholder="Optional"
              />
            </div>
            {#if form.selectedDates.length > 1}
              <button
                type="button"
                class="btn danger"
                onclick={() => removeSelectedDate(index)}
                aria-label={`Remove date ${index + 1}`}
              >Remove</button>
            {/if}
          </div>
        {/each}
        <button type="button" class="btn sm" onclick={addSelectedDate}>+ Add another date</button>
      </div>
    {:else if form.repeat !== 'once'}
      <div class="field-row">
        {#if form.repeat === 'until'}
          <div class="field">
            <label for="ed">Last day</label>
            <input id="ed" type="date" min={form.date} bind:value={form.endDate} required />
          </div>
        {/if}
        <div class="field">
          <span class="field-label">Days it runs</span>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap">
            {#each WEEKDAYS as d}
              <button
                type="button"
                class="btn sm"
                class:primary={form.repeatDays.includes(d.n)}
                onclick={() => toggleDay(d.n)}
              >{d.label}</button>
            {/each}
          </div>
        </div>
      </div>

      <p class="hint" style="margin-top:-.35rem">
        {#if form.repeatDays.length === 0}
          Pick at least one day.
        {:else if runPreview !== null && runPreview > 400}
          That is more than 400 days — shorten it, or set it to ongoing.
        {:else if runPreview !== null}
          Creates <strong>{runPreview}</strong> job{runPreview === 1 ? '' : 's'}, one per day.
          {#if form.repeat === 'ongoing'}
            Ongoing runs are filled 8 weeks ahead and topped up from the job page.
          {/if}
        {/if}
      </p>
    {/if}

    {#if form.repeat !== 'selected'}
    <div class="field">
      <label for="n">Notes</label>
      <textarea id="n" bind:value={form.notes}></textarea>
    </div>
    {/if}

    <div style="display:flex;gap:.5rem">
      <button class="btn primary" disabled={saving}>
        {saving ? 'Saving…' : form.repeat === 'once' ? 'Create job' : form.repeat === 'selected' ? 'Create jobs' : 'Create run'}
      </button>
      <button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
    </div>
  </form>
{/if}

<div class="card" style="margin-bottom:1rem">
  <div class="field-row" style="margin-bottom:0">
    <div class="field" style="margin-bottom:0">
      <label for="fs">Status</label>
      <select id="fs" bind:value={statusFilter}>
        <option value="">All</option>
        <option value="DRAFT">Draft</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="fc">Client</label>
      <select id="fc" bind:value={clientFilter}>
        <option value="">All</option>
        {#each clients as client}<option value={client.id}>{client.name}</option>{/each}
      </select>
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="ff">From</label>
      <input id="ff" type="date" bind:value={fromDate} />
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="ft">To</label>
      <input id="ft" type="date" bind:value={toDate} />
    </div>
  </div>
  <div class="field-row" style="margin-bottom:0;margin-top:.75rem">
    <div class="field" style="margin-bottom:0">
      <label for="fq">Search</label>
      <input id="fq" type="search" placeholder="Reference, job name or client" bind:value={searchTerm} />
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="fr">Role</label>
      <select id="fr" bind:value={roleFilter}>
        <option value="">Any</option>
        {#each roleOptions as role}<option value={role}>{role}</option>{/each}
      </select>
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="fw">Crew</label>
      <select id="fw" bind:value={crewFilter}>
        <option value="">Any</option>
        <option value="short">Short of crew</option>
        <option value="full">Fully crewed</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="fo">Order</label>
      <select id="fo" bind:value={sortOrder}>
        <option value="asc">Soonest first</option>
        <option value="desc">Latest first</option>
      </select>
    </div>
  </div>
  {#if filtered}
    <button class="btn sm" style="margin-top:.75rem" onclick={clearFilters}>Clear filters</button>
  {/if}
</div>

{#if loading}
  <div class="loading">Loading…</div>
{:else if visibleJobs.length === 0}
  <div class="card empty">
    {#if filtered}
      No jobs match those filters.
      <button class="btn sm" style="margin-left:.5rem" onclick={clearFilters}>Clear filters</button>
    {:else}
      No jobs yet — add your first one.
    {/if}
  </div>
{:else if view === 'calendar'}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <h2 style="margin:0">{monthLabel}</h2>
      <div style="display:flex;gap:.5rem">
        <button class="btn sm" onclick={() => goMonth(-1)}>← Previous</button>
        <button class="btn sm" onclick={thisMonth}>This month</button>
        <button class="btn sm" onclick={() => goMonth(1)}>Next →</button>
      </div>
    </div>

    <MonthGrid {month} jobs={visibleJobs} selected={selectedDay} onSelect={(iso) => (selectedDay = iso)} />

    <p class="hint" style="margin-top:.75rem">Click a day to see what's on it.</p>
  </div>

  {#if selectedDay}
    <div class="card" style="margin-top:1rem">
      <h2>{shortDate(selectedDay)}</h2>
      {#if dayJobs.length === 0}
        <div class="empty">Nothing on this day.</div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ref</th><th>Job</th><th>Client</th><th>Times</th>
                <th class="num">Hours</th><th class="num">Charge</th><th class="num">Crew</th><th>Status</th><th>Invoice</th><th></th>
              </tr>
            </thead>
            <tbody>
              {#each dayJobs as job}
                <tr class="clickable" onclick={() => navigate(`jobs/${job.id}`)}>
                  <td><a href="#/jobs/{job.id}">{job.reference}</a></td>
                  <td>
                    {job.title}
                    {#if job.roleNeeded}
                      <br /><span style="color:var(--text-dim);font-size:.8rem">{job.roleNeeded}</span>
                    {/if}
                  </td>
                  <td>{job.client?.name ?? '—'}</td>
                  <td>{job.startTime}–{job.endTime}</td>
                  <td class="num">{job.scheduledHours}</td>
                  <td class="num">{gbp(job.chargeRate)}</td>
                  <td class="num" style={crewShort(job) ? 'color:var(--red)' : ''}>{crewLabel(job)}</td>
                  <td><span class="badge {statusTone[job.status] ?? ''}">{job.status}</span></td>
                  <td><span class="badge {invoiceClass(job)}">{invoiceText(job)}</span></td>
                  <td>
                    {#if job.invoiceStatus !== 'PAID'}
                      <button class="btn sm primary" onclick={(event) => markInvoicePaid(event, job)} disabled={payingId === job.id}>
                        {payingId === job.id ? 'Saving…' : 'Mark paid'}
                      </button>
                    {/if}
                    <button class="btn sm" onclick={(event) => renameJob(event, job)}>Edit name</button>
                    <button class="btn sm danger" onclick={(event) => deleteJob(event, job)}>Delete</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
{:else}
  {#snippet jobRow(job: Job, depth: number, dimTitle: boolean)}
    <tr class="clickable" onclick={() => navigate(`jobs/${job.id}`)}>
      <td style={depth ? `padding-left:${0.5 + depth * 1.25}rem` : ''}><a href="#/jobs/{job.id}">{job.reference}</a></td>
      <td style={dimTitle ? 'color:var(--text-dim)' : ''}>
        {job.title}
        {#if job.roleNeeded && !dimTitle}
          <br /><span style="color:var(--text-dim);font-size:.8rem">{job.roleNeeded}</span>
        {/if}
      </td>
      <td>{job.client?.name ?? '—'}</td>
      <td>{shortDate(job.date)}</td>
      <td>{job.startTime}–{job.endTime}</td>
      <td class="num">{job.scheduledHours}</td>
      <td class="num">{gbp(job.chargeRate)}</td>
      <td class="num" style={crewShort(job) ? 'color:var(--red)' : ''}>{crewLabel(job)}</td>
      <td><span class="badge {statusTone[job.status] ?? ''}">{job.status}</span></td>
      <td><span class="badge {invoiceClass(job)}">{invoiceText(job)}</span></td>
      <td>
        {#if job.invoiceStatus !== 'PAID'}
          <button class="btn sm primary" onclick={(event) => markInvoicePaid(event, job)} disabled={payingId === job.id}>
            {payingId === job.id ? 'Saving…' : 'Mark paid'}
          </button>
        {/if}
        <button class="btn sm" onclick={(event) => renameJob(event, job)}>Edit name</button>
        <button class="btn sm danger" onclick={(event) => deleteJob(event, job)}>Delete</button>
      </td>
    </tr>
  {/snippet}

  {#snippet invoiceSummary(days: Job[], lead: Job)}
    {#if unpaidCompletedCount(days) > 0}
      <span class="badge red">
        {unpaidCompletedCount(days)} invoice{unpaidCompletedCount(days) === 1 ? '' : 's'} not paid
      </span>
    {:else}
      <span class="badge {invoiceClass(lead)}">{invoiceText(lead)}</span>
    {/if}
  {/snippet}

  {#snippet groupRows(group: Group, depth: number)}
    {#if !group.isRun}
      {@render jobRow(group.lead, depth, false)}
    {:else}
      {@const span = runSpan(group)}
      <!-- One row for the whole run. Its days are behind the arrow. -->
      <tr class="clickable" onclick={() => (expandedRuns[group.key] = !expandedRuns[group.key])}>
        <td style={depth ? `padding-left:${0.5 + depth * 1.25}rem` : ''}>
          <span style="color:var(--text-dim)">{expandedRuns[group.key] ? '▾' : '▸'}</span>
          {group.lead.reference}
        </td>
        <td>
          {group.lead.title}
          <span class="badge" style="margin-left:.35rem">{group.days.length} days</span>
        </td>
        <td>{group.lead.client?.name ?? '—'}</td>
        <td>{shortDate(span.from)} – {shortDate(span.to)}</td>
        <td>{group.lead.startTime}–{group.lead.endTime}</td>
        <td class="num">{group.lead.scheduledHours}</td>
        <td class="num">{gbp(group.lead.chargeRate)}</td>
        <td class="num" style={runShort(group.days) ? 'color:var(--red)' : ''}>{runCrewLabel(group.days)}</td>
        <td><span class="badge {statusTone[group.lead.status] ?? ''}">{group.lead.status}</span></td>
        <td>{@render invoiceSummary(group.days, group.lead)}</td>
        <td></td>
      </tr>
      {#if expandedRuns[group.key]}
        {#each group.days.slice().sort((a, b) => a.date.localeCompare(b.date)) as day}
          {@render jobRow(day, depth + 1, true)}
        {/each}
      {/if}
    {/if}
  {/snippet}

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Ref</th><th>Job</th><th>Client</th><th>Date</th><th>Times</th>
          <th class="num">Hours</th><th class="num">Charge</th><th class="num">Crew</th><th>Status</th><th>Invoice</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each clientGroups as entry}
          {#if !isClientGroup(entry)}
            {@render groupRows(entry, 0)}
          {:else}
            {@const span = runSpan(entry)}
            {@const open = expandedClients[entry.key]}
            <!-- One header for the client. Its jobs, and their days, are behind the arrow. -->
            <tr class="clickable client-head" onclick={() => (expandedClients[entry.key] = !open)}>
              <td><span style="color:var(--text-dim)">{open ? '▾' : '▸'}</span></td>
              <td>
                <strong>{entry.name}</strong>
                <span class="badge" style="margin-left:.35rem">
                  {entry.groups.length} job{entry.groups.length === 1 ? '' : 's'} · {entry.days.length} days
                </span>
              </td>
              <td>{entry.name}</td>
              <td>{shortDate(span.from)} – {shortDate(span.to)}</td>
              <td></td>
              <td class="num"></td>
              <td class="num"></td>
              <td class="num" style={runShort(entry.days) ? 'color:var(--red)' : ''}>{runCrewLabel(entry.days)}</td>
              <td></td>
              <td>{@render invoiceSummary(entry.days, entry.groups[0]!.lead)}</td>
              <td></td>
            </tr>
            {#if open}
              {#each entry.groups as group}
                {@render groupRows(group, 1)}
              {/each}
            {/if}
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .client-head td {
    background: color-mix(in srgb, var(--gold) 6%, transparent);
  }
</style>
