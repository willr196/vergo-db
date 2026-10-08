<script lang="ts">
  import { api, gbp, shortDate } from '../lib/api';

  type Dash = {
    label: string;
    jobsThisWeek: number;
    unstaffedJobs: { id: string; reference: string; title: string; clientName: string | null; date: string }[];
    committedWageCost: string;
    activeStaffCount: number;
    staffWithoutRate: { id: string; name: string }[];
  };

  let data = $state<Dash | null>(null);
  let error = $state('');

  api
    .get<Dash>('/api/dashboard')
    .then((d) => (data = d))
    .catch((e) => (error = e.message));
</script>

<div class="page-head">
  <div>
    <h1>Dashboard</h1>
    <p>The next seven days.</p>
  </div>
</div>

{#if error}
  <div class="notice error">{error}</div>
{:else if !data}
  <div class="loading">Loading…</div>
{:else}
  <div class="grid cols-4">
    <div class="card stat">
      <div class="label">Jobs this week</div>
      <div class="value">{data.jobsThisWeek}</div>
    </div>
    <div class="card stat">
      <div class="label">Needs staffing</div>
      <div class="value" class:gold={data.unstaffedJobs.length > 0}>{data.unstaffedJobs.length}</div>
    </div>
    <div class="card stat">
      <div class="label">Wage cost committed</div>
      <div class="value">{gbp(data.committedWageCost)}</div>
      <div class="estimate-note">{data.label}</div>
    </div>
    <div class="card stat">
      <div class="label">Active people</div>
      <div class="value">{data.activeStaffCount}</div>
    </div>
  </div>

  {#if data.unstaffedJobs.length > 0}
    <div class="card" style="margin-top:1rem">
      <h2>Jobs with nobody on them</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Ref</th><th>Job</th><th>Client</th><th>Date</th></tr>
          </thead>
          <tbody>
            {#each data.unstaffedJobs as job}
              <tr>
                <td><a href="#/jobs/{job.id}">{job.reference}</a></td>
                <td>{job.title}</td>
                <td>{job.clientName ?? '—'}</td>
                <td>{shortDate(job.date)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  {#if data.staffWithoutRate.length > 0}
    <div class="card" style="margin-top:1rem">
      <h2>No rate set</h2>
      <p class="hint" style="margin-bottom:.85rem">
        These people can't be put on a job until they have an hourly rate.
      </p>
      {#each data.staffWithoutRate as person}
        <div style="padding:.3rem 0">
          <a href="#/staff/{person.id}">{person.name}</a>
        </div>
      {/each}
    </div>
  {/if}
{/if}
