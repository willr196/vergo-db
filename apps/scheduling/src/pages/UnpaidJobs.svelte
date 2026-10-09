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
    invoiceStatus: string;
    client: { id: string; name: string } | null;
  };

  let jobs = $state<Job[]>([]);
  let error = $state('');
  let loading = $state(true);
  let payingId = $state('');

  // The work is done and the money is not in. Asking for both unpaid states
  // keeps the paid history — which only grows — out of the response entirely.
  // No paging here on purpose: a chase list you cannot see the bottom of is
  // not doing its job, and if this ever runs to hundreds the problem is the
  // invoices, not the page.
  async function load() {
    loading = true;
    try {
      jobs = await api.get<Job[]>('/api/jobs?status=COMPLETED&invoiceStatus=NOT_INVOICED,INVOICED');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  load();

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
</script>

<div class="page-head">
  <div>
    <h1>Awaiting payment</h1>
    <p>Completed jobs whose invoice has not been paid. Mark one paid and it moves to Completed.</p>
  </div>
  {#if jobs.length > 0}
    <div class="badge red">{jobs.length} unpaid</div>
  {/if}
</div>

{#if error}
  <div class="notice error">{error}</div>
{/if}

{#if loading}
  <div class="card empty">Loading…</div>
{:else if jobs.length === 0}
  <div class="card empty">Nothing outstanding. Every completed job has been paid.</div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Ref</th><th>Job</th><th>Client</th><th>Date</th><th>Times</th>
          <th class="num">Hours</th><th class="num">Charge</th><th class="num">Crew</th>
          <th>Invoice</th><th></th>
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
            <td>
              <span class="badge red">
                {job.invoiceStatus === 'INVOICED' ? 'Invoice unpaid' : 'Not invoiced'}
              </span>
            </td>
            <td>
              <button
                class="btn sm"
                disabled={payingId === job.id}
                onclick={(event) => markInvoicePaid(event, job)}
              >
                {payingId === job.id ? 'Saving…' : 'Mark paid'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
