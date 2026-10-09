<script lang="ts">
  import { api, shortDate, todayIso } from '../lib/api';

  type Lead = {
    id: string;
    company: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactedOn: string;
    channel: string;
    stage: string;
    notes: string | null;
    client: { id: string; name: string } | null;
  };

  let leads = $state<Lead[]>([]);
  let loading = $state(true);
  let error = $state('');
  let stageFilter = $state('');

  let editingId = $state<string | null>(null);
  let showForm = $state(false);
  let saving = $state(false);
  let busyId = $state('');

  const blank = () => ({
    company: '', contactName: '', contactEmail: '', contactPhone: '',
    contactedOn: todayIso(), channel: 'EMAIL', stage: 'CONTACTED', notes: '',
  });
  let form = $state(blank());

  const stageLabel: Record<string, string> = {
    CONTACTED: 'Contacted', REPLIED: 'Replied', WON: 'Won', LOST: 'Lost',
  };
  const stageTone: Record<string, string> = {
    CONTACTED: 'amber', REPLIED: 'gold', WON: 'green', LOST: 'red',
  };
  const channelLabel: Record<string, string> = {
    EMAIL: 'Email', PHONE: 'Phone', IN_PERSON: 'In person', OTHER: 'Other',
  };

  async function load() {
    loading = true;
    try {
      leads = await api.get<Lead[]>(`/api/leads${stageFilter ? `?stage=${stageFilter}` : ''}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    stageFilter;
    load();
  });

  // A lead nobody has heard back from is the one that needs chasing, so the
  // header counts those rather than the total.
  const waiting = $derived(leads.filter((lead) => lead.stage === 'CONTACTED').length);

  function startNew() {
    form = blank();
    editingId = null;
    showForm = true;
    error = '';
  }

  function startEdit(lead: Lead) {
    form = {
      company: lead.company,
      contactName: lead.contactName ?? '',
      contactEmail: lead.contactEmail ?? '',
      contactPhone: lead.contactPhone ?? '',
      contactedOn: lead.contactedOn.slice(0, 10),
      channel: lead.channel,
      stage: lead.stage,
      notes: lead.notes ?? '',
    };
    editingId = lead.id;
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
      notes: form.notes || null,
    };
    try {
      if (editingId) await api.patch(`/api/leads/${editingId}`, payload);
      else await api.post('/api/leads', payload);
      showForm = false;
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  /** Moving the stage is the main thing you do here, so it is one click. */
  async function setStage(lead: Lead, stage: string) {
    busyId = lead.id;
    error = '';
    try {
      await api.patch(`/api/leads/${lead.id}`, { stage });
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = '';
    }
  }

  async function convert(lead: Lead) {
    busyId = lead.id;
    error = '';
    try {
      await api.post(`/api/leads/${lead.id}/convert`);
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = '';
    }
  }

  async function remove(lead: Lead) {
    busyId = lead.id;
    error = '';
    try {
      await api.del(`/api/leads/${lead.id}`);
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = '';
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>Outreach</h1>
    <p>Companies you have approached, whether they came back, and what came of it.</p>
  </div>
  <button class="btn primary" onclick={startNew}>Log outreach</button>
</div>

{#if error}<div class="notice error">{error}</div>{/if}

{#if showForm}
  <form class="card" onsubmit={save} style="margin-bottom:1rem">
    <h2>{editingId ? 'Edit outreach' : 'Log outreach'}</h2>

    <div class="field-row">
      <div class="field">
        <label for="co">Company</label>
        <input id="co" bind:value={form.company} required />
      </div>
      <div class="field">
        <label for="d">Contacted on</label>
        <input id="d" type="date" bind:value={form.contactedOn} required />
      </div>
      <div class="field">
        <label for="ch">How</label>
        <select id="ch" bind:value={form.channel}>
          <option value="EMAIL">Email</option>
          <option value="PHONE">Phone</option>
          <option value="IN_PERSON">In person</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div class="field">
        <label for="st">Stage</label>
        <select id="st" bind:value={form.stage}>
          <option value="CONTACTED">Contacted</option>
          <option value="REPLIED">Replied</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </select>
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
      <label for="no">Notes — what you said, what they said</label>
      <textarea id="no" bind:value={form.notes}></textarea>
    </div>

    <div style="display:flex;gap:.5rem">
      <button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
    </div>
  </form>
{/if}

<div class="card" style="margin-bottom:1rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
  <div class="field" style="margin:0">
    <label for="fst">Stage</label>
    <select id="fst" bind:value={stageFilter}>
      <option value="">All</option>
      <option value="CONTACTED">Contacted, no reply</option>
      <option value="REPLIED">Replied</option>
      <option value="WON">Won</option>
      <option value="LOST">Lost</option>
    </select>
  </div>
  {#if waiting > 0 && !stageFilter}
    <span class="badge amber">{waiting} awaiting a reply</span>
  {/if}
</div>

{#if loading}
  <div class="loading">Loading…</div>
{:else if leads.length === 0}
  <div class="card empty">
    {stageFilter ? 'Nothing at this stage.' : 'No outreach logged yet — add the first company you approached.'}
  </div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Company</th><th>Contact</th><th>Contacted</th><th>How</th>
          <th>Stage</th><th>Notes</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each leads as lead}
          <tr>
            <td>
              {lead.company}
              {#if lead.client}
                <br /><a href="#/clients" style="font-size:.8rem">Now a client</a>
              {/if}
            </td>
            <td style="color:var(--text-dim);font-size:.85rem">
              {lead.contactName ?? '—'}
              {#if lead.contactEmail}<br />{lead.contactEmail}{/if}
              {#if lead.contactPhone}<br />{lead.contactPhone}{/if}
            </td>
            <td>{shortDate(lead.contactedOn)}</td>
            <td>{channelLabel[lead.channel] ?? lead.channel}</td>
            <td><span class="badge {stageTone[lead.stage] ?? ''}">{stageLabel[lead.stage] ?? lead.stage}</span></td>
            <td style="color:var(--text-dim);font-size:.85rem;max-width:20rem">{lead.notes ?? '—'}</td>
            <td style="text-align:right;white-space:nowrap">
              {#if lead.stage === 'CONTACTED'}
                <button class="btn sm" disabled={busyId === lead.id} onclick={() => setStage(lead, 'REPLIED')}>
                  They replied
                </button>
              {/if}
              {#if !lead.client && lead.stage !== 'LOST'}
                <button class="btn sm" disabled={busyId === lead.id} onclick={() => convert(lead)}>
                  Won — make client
                </button>
              {/if}
              {#if lead.stage !== 'LOST' && !lead.client}
                <button class="btn sm" disabled={busyId === lead.id} onclick={() => setStage(lead, 'LOST')}>
                  Lost
                </button>
              {/if}
              <button class="btn sm" onclick={() => startEdit(lead)}>Edit</button>
              {#if !lead.client}
                <button class="btn sm danger" disabled={busyId === lead.id} onclick={() => remove(lead)}>
                  Delete
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
