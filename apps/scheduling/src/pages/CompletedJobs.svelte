<script lang="ts">
  import { api, gbp, shortDate } from '../lib/api';
  import { navigate } from '../lib/router.svelte';

  type Job = {
    id: string;
    reference: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    chargeRate: string;
    scheduledHours: string;
    crewCount: number;
    status: string;
    client: { id: string; name: string } | null;
  };

  let jobs = $state<Job[]>([]);
  let error = $state('');
  let loading = $state(true);
  let more = $state(false);

  // Nothing ever leaves this page, so it is the one list that grows without
  // limit. It arrives a page at a time, newest first: asking for one row more
  // than we show is how we know whether to offer the button.
  const PAGE = 50;

  // A paid invoice is what finishes a job, so a confirmed job that has been
  // paid belongs here just as much as one marked completed.
  async function loadMore() {
    loading = true;
    try {
      const batch = await api.get<Job[]>(
        `/api/jobs?invoiceStatus=PAID&offset=${jobs.length}&limit=${PAGE + 1}`
      );
      more = batch.length > PAGE;
      jobs = [...jobs, ...batch.slice(0, PAGE)];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  loadMore();

  const statusTone: Record<string, string> = {
    DRAFT: '',
    CONFIRMED: 'gold',
    COMPLETED: 'green',
    CANCELLED: 'red',
  };
</script>

<div class="page-head">
  <div>
    <h1>Completed</h1>
    <p>Jobs with a paid invoice, confirmed or completed. They are kept here as your completed work record.</p>
  </div>
</div>

{#if error}
  <div class="notice error">{error}</div>
{/if}

{#if jobs.length === 0}
  <div class="card empty">{loading ? "Loading…" : "No paid jobs yet."}</div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Ref</th><th>Job</th><th>Client</th><th>Date</th><th>Times</th>
          <th class="num">Hours</th><th class="num">Charge</th><th class="num">Crew</th>
          <th>Status</th><th>Invoice</th>
        </tr>
      </thead>
      <tbody>
        {#each jobs as job}
          <tr class="clickable" onclick={() => navigate(`jobs/${job.id}`)}>
            <td><a href="#/jobs/{job.id}">{job.reference}</a></td>
            <td>{job.title}</td>
            <td>{job.client?.name ?? '—'}</td>
            <td>{shortDate(job.date)}</td>
            <td>{job.startTime}–{job.endTime}</td>
            <td class="num">{job.scheduledHours}</td>
            <td class="num">{gbp(job.chargeRate)}</td>
            <td class="num">{job.crewCount}</td>
            <td><span class="badge {statusTone[job.status] ?? ''}">{job.status}</span></td>
            <td><span class="badge green">Invoice paid</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if more}
    <div style="margin-top:1rem">
      <button class="btn" disabled={loading} onclick={loadMore}>
        {loading ? "Loading…" : `Load ${PAGE} more`}
      </button>
    </div>
  {/if}
{/if}
