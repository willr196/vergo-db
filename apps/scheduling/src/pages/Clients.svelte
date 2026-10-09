<script lang="ts">
  import { api, gbp } from '../lib/api';

  type Client = {
    id: string; name: string;
    contactName: string | null; contactEmail: string | null; contactPhone: string | null;
    defaultChargeRate: string | null; notes: string | null; archived: boolean;
    _count: { jobs: number };
  };

  let clients = $state<Client[]>([]);
  let loading = $state(true);
  let error = $state('');
  let showArchived = $state(false);

  let editingId = $state<string | null>(null);
  let showForm = $state(false);
  let saving = $state(false);

  const blank = () => ({
    name: '', contactName: '', contactEmail: '', contactPhone: '',
    defaultChargeRate: '', notes: '',
  });
  let form = $state(blank());

  async function load() {
    loading = true;
    try {
      clients = await api.get<Client[]>(`/api/clients${showArchived ? '' : '?archived=false'}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  load();
  $effect(() => {
    showArchived;
    load();
  });

  function startNew() {
    form = blank();
    editingId = null;
    showForm = true;
    error = '';
  }

  function startEdit(client: Client) {
    form = {
      name: client.name,
      contactName: client.contactName ?? '',
      contactEmail: client.contactEmail ?? '',
      contactPhone: client.contactPhone ?? '',
      defaultChargeRate: client.defaultChargeRate ?? '',
      notes: client.notes ?? '',
    };
    editingId = client.id;
    showForm = true;
    error = '';
  }

  async function save(event: Event) {
    event.preventDefault();
    saving = true;
    error = '';
    const payload = {
      ...form,
      contactName: form.contactName || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      defaultChargeRate: form.defaultChargeRate || null,
      notes: form.notes || null,
    };
    try {
      if (editingId) await api.patch(`/api/clients/${editingId}`, payload);
      else await api.post('/api/clients', payload);
      showForm = false;
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function toggleArchive(client: Client) {
    error = '';
    try {
      await api.patch(`/api/clients/${client.id}`, { archived: !client.archived });
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>Clients</h1>
    <p>Their usual charge rate pre-fills when you create a job.</p>
  </div>
  <button class="btn primary" onclick={startNew}>Add client</button>
</div>

{#if error}<div class="notice error">{error}</div>{/if}

{#if showForm}
  <form class="card" onsubmit={save} style="margin-bottom:1rem">
    <h2>{editingId ? 'Edit client' : 'New client'}</h2>

    <div class="field-row">
      <div class="field">
        <label for="n">Name</label>
        <input id="n" bind:value={form.name} required />
      </div>
      <div class="field">
        <label for="r">Usual charge rate £/hr</label>
        <input id="r" type="number" step="0.01" min="0" bind:value={form.defaultChargeRate} />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="cn">Contact name</label>
        <input id="cn" bind:value={form.contactName} />
      </div>
      <div class="field">
        <label for="ce">Email (optional)</label>
        <input id="ce" type="email" bind:value={form.contactEmail} />
      </div>
      <div class="field">
        <label for="cp">Phone (optional)</label>
        <input id="cp" bind:value={form.contactPhone} />
      </div>
    </div>

    <div class="field">
      <label for="no">Notes</label>
      <textarea id="no" bind:value={form.notes}></textarea>
    </div>

    <div style="display:flex;gap:.5rem">
      <button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
    </div>
  </form>
{/if}

<div class="card" style="margin-bottom:1rem">
  <label style="display:flex;align-items:center;gap:.5rem;margin:0;cursor:pointer">
    <input type="checkbox" bind:checked={showArchived} style="width:auto" />
    Include archived
  </label>
</div>

{#if loading}
  <div class="loading">Loading…</div>
{:else if clients.length === 0}
  <div class="card empty">No clients yet — add one, then you can start creating jobs.</div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Client</th><th>Contact</th><th class="num">Usual rate</th>
          <th class="num">Jobs</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each clients as client}
          <tr>
            <td>
              {client.name}
              {#if client.archived}<span class="badge" style="margin-left:.35rem">Archived</span>{/if}
            </td>
            <td style="color:var(--text-dim);font-size:.85rem">
              {client.contactName ?? '—'}
              {#if client.contactEmail}<br />{client.contactEmail}{/if}
            </td>
            <td class="num">{gbp(client.defaultChargeRate)}</td>
            <td class="num">{client._count.jobs}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn sm" onclick={() => startEdit(client)}>Edit</button>
              <button class="btn sm" onclick={() => toggleArchive(client)}>
                {client.archived ? 'Restore' : 'Archive'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
