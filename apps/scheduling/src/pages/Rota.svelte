<script lang="ts">
  import { api, mondayOf, addDays, weekday, shortDate } from '../lib/api';

  type Rota = {
    weekStart: string;
    days: string[];
    staff: { id: string; name: string; weeklyHours: string; overWorkingTimeLimit: boolean }[];
    jobs: {
      id: string; reference: string; title: string; clientName: string | null;
      date: string; startTime: string; endTime: string; staffIds: string[]; crewCount: number; hours: string;
    }[];
  };

  let weekStart = $state(mondayOf(new Date()));
  let data = $state<Rota | null>(null);
  let loading = $state(true);
  let error = $state('');

  async function load() {
    loading = true;
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
    load();
  });

  const shift = (days: number) => (weekStart = addDays(weekStart, days));

  /** Jobs for one person on one day. */
  function jobsFor(staffId: string, day: string) {
    return data?.jobs.filter((j) => j.date === day && j.staffIds.includes(staffId)) ?? [];
  }

  /** Jobs that day with nobody on them at all. */
  function unstaffed(day: string) {
    return data?.jobs.filter((j) => j.date === day && j.crewCount === 0) ?? [];
  }
</script>

<div class="page-head">
  <div>
    <h1>Rota</h1>
    <p>Week beginning {shortDate(weekStart)}</p>
  </div>
  <div style="display:flex;gap:.5rem;align-items:center">
    <button class="btn" onclick={() => shift(-7)}>← Previous</button>
    <button class="btn" onclick={() => (weekStart = mondayOf(new Date()))}>This week</button>
    <button class="btn" onclick={() => shift(7)}>Next →</button>
  </div>
</div>

{#if error}<div class="notice error">{error}</div>{/if}

{#if loading}
  <div class="loading">Loading…</div>
{:else if data}
  {#if data.staff.length === 0}
    <div class="card empty">No active people yet. <a href="#/staff">Add someone</a> and they will appear here.</div>
  {:else}
    <div style="overflow-x:auto">
      <div class="rota" style="grid-template-columns:180px repeat(7, minmax(110px, 1fr))">
        <div class="rota-cell rota-head"></div>
        {#each data.days as day}
          <div class="rota-cell rota-head">{weekday(day)}</div>
        {/each}

        {#each data.staff as person}
          <div class="rota-cell rota-name">
            <div>{person.name}</div>
            <div class="hours" class:red={person.overWorkingTimeLimit}
                 style={person.overWorkingTimeLimit ? 'color:var(--red)' : ''}>
              {person.weeklyHours} hrs{person.overWorkingTimeLimit ? ' · over 48' : ''}
            </div>
          </div>
          {#each data.days as day}
            <div class="rota-cell">
              {#each jobsFor(person.id, day) as job}
                <a href="#/jobs/{job.id}" class="rota-block" style="display:block;text-decoration:none">
                  <span class="ref">{job.title}</span><br />
                  {job.startTime}–{job.endTime}
                </a>
              {/each}
            </div>
          {/each}
        {/each}
      </div>
    </div>

    {#if data.staff.some((s) => s.overWorkingTimeLimit)}
      <div class="notice warn" style="margin-top:1rem">
        Someone is over 48 hours this week. They'd need a signed working time opt-out.
      </div>
    {/if}

    {#if data.days.some((d) => unstaffed(d).length > 0)}
      <div class="card" style="margin-top:1rem">
        <h2>Nobody assigned</h2>
        {#each data.days as day}
          {#each unstaffed(day) as job}
            <div style="padding:.3rem 0;font-size:.9rem">
              <a href="#/jobs/{job.id}">{job.reference}</a>
              — {job.title} · {job.clientName ?? 'No client'} · {weekday(day)} {job.startTime}–{job.endTime}
            </div>
          {/each}
        {/each}
      </div>
    {/if}
  {/if}
{/if}
