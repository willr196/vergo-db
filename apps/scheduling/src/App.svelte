<script lang="ts">
  import { api, ApiError } from './lib/api';
  import { route } from './lib/router.svelte';

  import Dashboard from './pages/Dashboard.svelte';
  import Jobs from './pages/Jobs.svelte';
  import CompletedJobs from './pages/CompletedJobs.svelte';
  import UnpaidJobs from './pages/UnpaidJobs.svelte';
  import JobDetail from './pages/JobDetail.svelte';
  import JobSchedule from './pages/JobSchedule.svelte';
  import Staff from './pages/Staff.svelte';
  import StaffDetail from './pages/StaffDetail.svelte';
  import Clients from './pages/Clients.svelte';
  import Leads from './pages/Leads.svelte';
  import Rota from './pages/Rota.svelte';
  import Restore from './pages/Restore.svelte';

  // On the website, signing in is the VERGO admin login, shared with the rest
  // of admin and with Ops. No session sends you there and back.
  const LOGIN = '/login?redirect=' + encodeURIComponent('/scheduling/');
  const toLogin = () => window.location.assign(LOGIN);
  let username = $state<string | null>(null);
  let checking = $state(true);

  async function checkSession() {
    try {
      const me = await api.get<{ username: string }>('/api/me');
      username = me.username;
    } catch {
      username = null;
      toLogin();
    } finally {
      checking = false;
    }
  }

  checkSession();

  async function signOut() {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    username = null;
    window.location.assign('/login');
  }

  // Any 401 from a page means the session lapsed — drop back to the login screen.
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof ApiError && event.reason.status === 401) {
      username = null;
      toLogin();
    }
  });

  const nav = [
    { name: 'dashboard', label: 'Dashboard' },
    { name: 'jobs', label: 'Jobs' },
    { name: 'unpaid', label: 'Awaiting payment' },
    { name: 'completed', label: 'Completed' },
    { name: 'rota', label: 'Rota' },
    { name: 'staff', label: 'People' },
    { name: 'clients', label: 'Clients' },
    { name: 'leads', label: 'Outreach' },
  ];
</script>

{#if checking}
  <div class="loading">Loading…</div>
{:else if !username}
  <div class="loading">Signing in…</div>
{:else}
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        VERGO
        <small>Scheduling</small>
      </div>

      <nav class="nav">
        {#each nav as item}
          <a href="#/{item.name}" class:active={route.name === item.name}>{item.label}</a>
        {/each}
      </nav>

      <div class="sidebar-foot">
        <div>{username}</div>
        <a href="#/restore" class="foot-link" class:active={route.name === 'restore'}>Restore a desktop backup</a>
        <a href="/ops" class="foot-link">VERGO Ops ↗</a>
        <button class="btn sm" style="margin-top:.5rem" onclick={signOut}>Sign out</button>
      </div>
    </aside>

    <main class="main">
      {#if route.name === 'dashboard'}
        <Dashboard />
      {:else if route.name === 'jobs'}
        {#if route.params[0]}
          {#if route.params[1] === 'schedule'}
            {#key route.params[0]}<JobSchedule id={route.params[0]} />{/key}
          {:else}
            {#key route.params[0]}<JobDetail id={route.params[0]} />{/key}
          {/if}
        {:else}
          <Jobs />
        {/if}
      {:else if route.name === 'unpaid'}
        <UnpaidJobs />
      {:else if route.name === 'completed'}
        <CompletedJobs />
      {:else if route.name === 'rota'}
        <Rota />
      {:else if route.name === 'staff'}
        {#if route.params[0]}
          {#key route.params[0]}<StaffDetail id={route.params[0]} />{/key}
        {:else}
          <Staff />
        {/if}
      {:else if route.name === 'clients'}
        <Clients />
      {:else if route.name === 'leads'}
        <Leads />
      {:else if route.name === 'restore'}
        <Restore />
      {:else}
        <div class="empty">Nothing here.</div>
      {/if}
    </main>
  </div>
{/if}
