<script lang="ts">
  import { api } from '../lib/api';

  type Table = { key: string; label: string; inBackup: number; add: number; update: number; keep: number };
  type Plan = { tables: Table[]; conflicts: string[]; committed: boolean };

  let fileName = $state('');
  let sql = $state('');
  let plan = $state<Plan | null>(null);
  let error = $state('');
  let busy = $state(false);

  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    plan = null;
    error = '';
    if (!file) return;
    fileName = file.name;
    sql = await file.text();
    await run(false);
  }

  async function run(commit: boolean) {
    busy = true;
    error = '';
    try {
      plan = await api.post<Plan>('/api/restore', { sql, commit });
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const changes = (p: Plan) => p.tables.reduce((n, t) => n + t.add + t.update, 0);
</script>

<div class="page-head">
  <div>
    <h1>Restore a desktop backup</h1>
    <p>Bring bookings made in the desktop tool onto the website, row for row.</p>
  </div>
</div>

<div class="card">
  <h2>Choose a backup</h2>
  <p style="margin-top:0;color:var(--text-dim);font-size:0.9rem">
    A <code>vergo-ops-*.sql</code> file from <code>Documents\vergo_admin\backups</code>. Rows are matched by id:
    new ones are added, ones edited more recently on the desktop replace the copy here, and ones edited more
    recently here are kept. Nothing is deleted, so restoring the same backup twice changes nothing.
  </p>
  <div class="field">
    <input type="file" accept=".sql" onchange={choose} disabled={busy} />
  </div>
</div>

{#if error}<div class="notice error" style="margin-top:1rem">{error}</div>{/if}

{#if plan}
  <div class="card">
    <h2>{plan.committed ? 'Restored' : 'What this backup would change'}{fileName ? ` · ${fileName}` : ''}</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th></th><th class="num">In backup</th><th class="num">Add</th><th class="num">Update</th><th class="num">Keep as is</th></tr></thead>
        <tbody>
          {#each plan.tables as t}
            <tr><td>{t.label}</td><td class="num">{t.inBackup}</td><td class="num">{t.add}</td><td class="num">{t.update}</td><td class="num">{t.keep}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if plan.conflicts.length}
      <div class="notice error" style="margin-top:1rem">
        These clash with records here, so nothing can be restored until they are sorted out:
        <ul>{#each plan.conflicts as c}<li>{c}</li>{/each}</ul>
      </div>
    {:else if plan.committed}
      <div class="notice info" style="margin-top:1rem">Done. {changes(plan)} row{changes(plan) === 1 ? '' : 's'} written.</div>
    {:else if changes(plan) === 0}
      <div class="notice info" style="margin-top:1rem">Everything in this backup is already here.</div>
    {:else}
      <div style="margin-top:1rem">
        <button class="btn primary" onclick={() => run(true)} disabled={busy}>
          {busy ? 'Restoring…' : `Restore ${changes(plan)} row${changes(plan) === 1 ? '' : 's'}`}
        </button>
      </div>
    {/if}
  </div>
{/if}
