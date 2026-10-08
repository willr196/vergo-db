<script lang="ts">
  import { monthCells } from './month';

  /**
   * A month of days, Monday first, with a marker on each day that has work on
   * it. Clicking a day hands the date back; the page decides what to show.
   *
   * All the arithmetic is UTC. Local-time date maths shifts a day across the
   * March and October clock changes, which would silently put a job in the
   * wrong cell.
   */

  type DayJob = { id: string; date: string; status: string };

  let {
    month,
    jobs,
    selected = null,
    onSelect,
  }: {
    /** Any date inside the month to show, as YYYY-MM-DD. */
    month: string;
    jobs: DayJob[];
    selected?: string | null;
    onSelect: (iso: string) => void;
  } = $props();

  const grid = $derived(monthCells(month));

  // One pass, not a filter per cell: 42 cells over a few hundred jobs is a lot
  // of repeated scanning for something that changes only when the jobs do.
  const byDay = $derived.by(() => {
    const map = new Map<string, { total: number; live: number }>();
    for (const job of jobs) {
      const key = job.date.slice(0, 10);
      const entry = map.get(key) ?? { total: 0, live: 0 };
      entry.total++;
      if (job.status !== 'CANCELLED') entry.live++;
      map.set(key, entry);
    }
    return map;
  });

  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
</script>

<div class="month-grid">
  {#each NAMES as name}
    <div class="month-head">{name}</div>
  {/each}

  {#each grid as cell}
    {@const counts = byDay.get(cell.iso)}
    <button
      type="button"
      class="month-cell"
      class:outside={!cell.inMonth}
      class:today={cell.isToday}
      class:selected={selected === cell.iso}
      class:has-work={Boolean(counts)}
      onclick={() => onSelect(cell.iso)}
      aria-label="{cell.iso}{counts ? `, ${counts.total} job${counts.total === 1 ? '' : 's'}` : ', no jobs'}"
    >
      <span class="month-day">{cell.dayNumber}</span>
      {#if counts}
        <span class="month-count" class:all-cancelled={counts.live === 0}>
          {counts.total}
        </span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }

  .month-head {
    text-align: center;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    padding-bottom: 0.35rem;
  }

  .month-cell {
    position: relative;
    aspect-ratio: 1 / 1;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .month-cell:hover {
    border-color: var(--gold);
  }

  .month-cell.outside {
    opacity: 0.35;
  }

  .month-cell.today {
    border-color: var(--text-dim);
  }

  .month-cell.selected {
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px var(--gold);
  }

  .month-day {
    font-size: 0.85rem;
    line-height: 1;
  }

  .month-count {
    font-size: 0.7rem;
    line-height: 1;
    padding: 0.1rem 0.3rem;
    border-radius: 999px;
    background: var(--gold);
    color: #000;
  }

  /* A day whose jobs are all cancelled still has something on it, but it is
     not work any more — show it without the emphasis. */
  .month-count.all-cancelled {
    background: var(--border);
    color: var(--text-dim);
  }

  @media (max-width: 640px) {
    .month-cell {
      min-height: 36px;
    }
  }
</style>
