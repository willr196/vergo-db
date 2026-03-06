(function () {
  'use strict';

  var get   = AdminCore.fetchJSON;
  var esc   = AdminCore.escapeHtml;
  var toast = function (m, t) { AdminCore.toast(m, t); };

  var GOLD    = '#D4AF37';
  var SUCCESS = '#22c55e';
  var INFO    = '#3b82f6';
  var ERROR   = '#ef4444';
  var WARNING = '#f59e0b';
  var TEAL    = '#20c997';

  var charts = {};
  var lastData = null;

  var CHART_DEFAULTS = {
    color: '#888',
    font: { family: 'Inter, sans-serif', size: 11 }
  };

  Chart.defaults.color = CHART_DEFAULTS.color;
  Chart.defaults.font  = CHART_DEFAULTS.font;

  function gridColor() { return 'rgba(255,255,255,0.06)'; }

  // ── Weekly delta ────────────────────────────────────────
  function delta(curr, prev) {
    if (prev === 0 && curr === 0) return { text: 'No change', cls: 'flat' };
    if (prev === 0) return { text: '+' + curr + ' (new)', cls: 'up' };
    var pct = Math.round(((curr - prev) / prev) * 100);
    if (pct > 0)  return { text: '▲ +' + pct + '% vs last week', cls: 'up' };
    if (pct < 0)  return { text: '▼ ' + pct + '% vs last week', cls: 'down' };
    return { text: 'Same as last week', cls: 'flat' };
  }

  function renderWeekly(weekly) {
    var metrics = [
      { id: 'wk-apps',    valId: 'wk-apps-delta',    data: weekly.applications },
      { id: 'wk-clients', valId: 'wk-clients-delta',  data: weekly.clients },
      { id: 'wk-quotes',  valId: 'wk-quotes-delta',   data: weekly.quotes }
    ];
    metrics.forEach(function (m) {
      var valEl   = document.getElementById(m.id);
      var deltaEl = document.getElementById(m.valId);
      if (valEl)   valEl.textContent   = m.data.thisWeek;
      if (deltaEl) {
        var d = delta(m.data.thisWeek, m.data.prevWeek);
        deltaEl.textContent  = d.text;
        deltaEl.className    = 'weekly-delta ' + d.cls;
      }
    });
  }

  // ── Charts ──────────────────────────────────────────────
  function createFunnelChart(funnel) {
    var ctx = document.getElementById('chart-funnel');
    if (!ctx) return;
    if (charts.funnel) charts.funnel.destroy();

    var labels = funnel.map(function (f) { return f.status; });
    var values = funnel.map(function (f) { return f.count; });
    var colors = funnel.map(function (f) {
      if (f.status === 'RECEIVED')   return INFO;
      if (f.status === 'REVIEWING')  return WARNING;
      if (f.status === 'SHORTLISTED')return SUCCESS;
      if (f.status === 'HIRED')      return TEAL;
      return ERROR;
    });

    charts.funnel = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: 'Applicants', data: values, backgroundColor: colors, borderRadius: 5 }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor() }, ticks: { precision: 0 } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function createClientGrowthChart(growth) {
    var ctx = document.getElementById('chart-clients');
    if (!ctx) return;
    if (charts.clients) charts.clients.destroy();

    charts.clients = new Chart(ctx, {
      type: 'line',
      data: {
        labels: growth.labels,
        datasets: [{
          label: 'New Clients',
          data: growth.data,
          borderColor: GOLD,
          backgroundColor: 'rgba(212,175,55,0.1)',
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: GOLD
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor() }, ticks: { precision: 0 } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function createPipelineChart(pipeline) {
    var ctx = document.getElementById('chart-pipeline');
    if (!ctx) return;
    if (charts.pipeline) charts.pipeline.destroy();

    var statuses = Object.keys(pipeline);
    var counts   = statuses.map(function (s) { return pipeline[s].count; });
    var palette  = [INFO, WARNING, SUCCESS, ERROR, TEAL];

    charts.pipeline = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: statuses,
        datasets: [{
          data: counts,
          backgroundColor: statuses.map(function (_, i) { return palette[i % palette.length]; }),
          borderWidth: 2,
          borderColor: '#181818'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var s = statuses[ctx.dataIndex];
                var v = pipeline[s].value;
                return ' ' + ctx.label + ': ' + ctx.raw + ' (£' + v.toLocaleString('en-GB') + ')';
              }
            }
          }
        }
      }
    });
  }

  function createRolesChart(roles) {
    var ctx = document.getElementById('chart-roles');
    if (!ctx) return;
    if (charts.roles) charts.roles.destroy();

    charts.roles = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: roles.map(function (r) { return r.role; }),
        datasets: [{
          label: 'Applications',
          data: roles.map(function (r) { return r.count; }),
          backgroundColor: GOLD,
          borderRadius: 5
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: gridColor() }, ticks: { precision: 0 } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // ── Load all ─────────────────────────────────────────────
  async function loadAnalytics() {
    try {
      var data = await get('/api/v1/admin/analytics');
      lastData = data;

      renderWeekly(data.weekly);
      createFunnelChart(data.funnel);
      createClientGrowthChart(data.clientGrowth);
      createPipelineChart(data.quotePipeline);
      createRolesChart(data.topRoles);
    } catch (e) {
      toast('Failed to load analytics: ' + e.message, 'error');
    }
  }

  // ── CSV export ───────────────────────────────────────────
  function exportCSV() {
    if (!lastData) { toast('No data loaded', 'warning'); return; }

    // Funnel
    AdminCore.exportCSV(
      lastData.funnel.map(function (f) { return { Status: f.status, Count: f.count }; }),
      'analytics-funnel'
    );
  }

  // ── Events ──────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'refresh')    return loadAnalytics();
    if (el.dataset.action === 'export-csv') return exportCSV();
  });

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await loadAnalytics();
  }

  window.addEventListener('load', init);
}());
