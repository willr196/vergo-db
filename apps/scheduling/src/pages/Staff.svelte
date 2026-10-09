<script lang="ts">
  import { api, gbp } from '../lib/api';
  import { navigate } from '../lib/router.svelte';

  type Person = {
    id: string;
    firstName: string;
    lastName: string;
    hourlyRate: string | null;
    /** Base rate plus holiday. What the person actually costs on a job. */
    allInRate: string | null;
    status: string;
    email: string | null;
    phone: string | null;
  };

  let people = $state<Person[]>([]);
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let statusFilter = $state('ACTIVE');

  let showForm = $state(false);
  let saving = $state(false);
  let formError = $state('');
  const blank = () => ({
    firstName: '', lastName: '', email: '', phone: '', hourlyRate: '', notes: '',
  });
  let form = $state(blank());

  async function load() {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      people = await api.get<Person[]>(`/api/staff?${params}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  load();
  $effect(() => {
    statusFilter;
    search;
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  });

  async function save(event: Event) {
    event.preventDefault();
    saving = true;
    formError = '';
    try {
      await api.post('/api/staff', {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
        hourlyRate: form.hourlyRate || null,
        notes: form.notes || null,
      });
      showForm = false;
      form = blank();
      await load();
    } catch (e) {
      formError = (e as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>People</h1>
    <p>
      Who you can put on a job, and what they cost. Dates of birth, tax codes
      and NI numbers live in the payroll panel, not here.
    </p>
  </div>
  <button class="btn primary" onclick={() => { form = blank(); formError = ''; showForm = true; }}>
    Add person
  </button>
</div>

{#if error}<div class="notice error">{error}</div>{/if}

{#if showForm}
  <form class="card" onsubmit={save} style="margin-bottom:1rem">
    <h2>New person</h2>
    {#if formError}<div class="notice error">{formError}</div>{/if}

    <div class="field-row">
      <div class="field">
        <label for="fn">First name</label>
        <input id="fn" bind:value={form.firstName} required />
      </div>
      <div class="field">
        <label for="ln">Last name</label>
        <input id="ln" bind:value={form.lastName} required />
      </div>
      <div class="field">
        <label for="hr">Hourly rate £</label>
        <input id="hr" type="number" step="0.01" min="0" bind:value={form.hourlyRate} />
        <div class="hint">Used to cost a job. Holiday pay is added on top.</div>
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

    <div style="display:flex;gap:.5rem">
      <button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Add person'}</button>
      <button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
    </div>
  </form>
{/if}

<div class="card" style="margin-bottom:1rem">
  <div class="field-row" style="margin-bottom:0">
    <div class="field" style="margin-bottom:0">
      <label for="q">Search</label>
      <input id="q" bind:value={search} placeholder="Name or email" />
    </div>
    <div class="field" style="margin-bottom:0">
      <label for="st">Status</label>
      <select id="st" bind:value={statusFilter}>
        <option value="">All</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </select>
    </div>
  </div>
</div>

{#if loading}
  <div class="loading">Loading…</div>
{:else if people.length === 0}
  <div class="card empty">
    {#if search || statusFilter !== 'ACTIVE'}
      Nobody matches that.
    {:else}
      No people yet — add someone to get started.
    {/if}
  </div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th class="num">Rate</th><th class="num">All-in</th><th>Contact</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#each people as person}
          <tr class="clickable" onclick={() => navigate(`staff/${person.id}`)}>
            <td>
              <a href="#/staff/{person.id}">{person.firstName} {person.lastName}</a>
            </td>
            <td class="num">
              {#if person.hourlyRate}
                {gbp(person.hourlyRate)}
              {:else}
                <span class="badge red">No rate</span>
              {/if}
            </td>
            <td class="num">
              {#if person.allInRate}{gbp(person.allInRate)}{:else}—{/if}
            </td>
            <td style="color:var(--text-dim);font-size:.85rem">{person.email ?? person.phone ?? '—'}</td>
            <td><span class="badge" class:green={person.status === 'ACTIVE'}>{person.status}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
