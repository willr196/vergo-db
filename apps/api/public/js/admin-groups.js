/**
 * admin-groups.js — candidate groups you name yourself ("Good bartenders").
 *
 * Shared by Applications and Staff: the Group filter, the pills on each row,
 * the Groups section in the person drawer, and the bulk "add / move / remove"
 * controls on Applications. Membership is per person, so someone stays in
 * their groups after they are hired.
 *
 * Any change fires `admin-groups-changed` on window; pages reload on it.
 */
(function () {
  'use strict';

  var esc    = AdminCore.escapeHtml;
  var fetch_ = AdminCore.fetchJSON;
  var toast  = function (m, t) { AdminCore.notify(m, t); };
  var BASE   = '/api/v1/admin/candidate-groups';

  var groups = [];

  function changed() {
    window.dispatchEvent(new CustomEvent('admin-groups-changed'));
  }

  function send(url, method, body) {
    return fetch_(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  async function load() {
    try {
      var data = await fetch_(BASE);
      groups = data.groups || [];
    } catch (e) {
      console.error('Groups failed to load', e);
    }
    return groups;
  }

  function byId(id) {
    return groups.find(function (g) { return g.id === id; }) || null;
  }

  async function create(name) {
    name = (name || '').trim();
    if (!name) { toast('Give the group a name', 'warning'); return null; }
    try {
      var data = await send(BASE, 'POST', { name: name });
      await load();
      return data.group;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  }

  async function addMembers(groupId, applicationIds, fromGroupId) {
    var body = { applicationIds: applicationIds };
    if (fromGroupId) body.fromGroupId = fromGroupId;
    await send(BASE + '/' + encodeURIComponent(groupId) + '/members', 'POST', body);
    await load();
    changed();
  }

  async function removeMembers(groupId, applicationIds) {
    await send(BASE + '/' + encodeURIComponent(groupId) + '/members', 'DELETE', { applicationIds: applicationIds });
    await load();
    changed();
  }

  async function rename(groupId) {
    var group = byId(groupId);
    if (!group) return;
    var name = window.prompt('Rename group', group.name);
    if (name === null || !name.trim() || name.trim() === group.name) return;
    try {
      await send(BASE + '/' + encodeURIComponent(groupId), 'PATCH', { name: name.trim() });
      await load();
      toast('Group renamed', 'success');
      changed();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function remove(groupId) {
    var group = byId(groupId);
    if (!group) return;
    if (!confirm('Delete the group "' + group.name + '"? The ' + group.count + ' people in it stay on the roster.')) return;
    try {
      await send(BASE + '/' + encodeURIComponent(groupId), 'DELETE');
      await load();
      toast('Group deleted', 'success');
      changed();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Rendering ───────────────────────────────────────────
  function pills(list) {
    if (!list || !list.length) return '';
    return '<div class="pill-wrap group-pills">' + list.map(function (g) {
      return '<span class="tag-pill tag-pill-group">' + esc(g.name) + '</span>';
    }).join('') + '</div>';
  }

  function optionsHtml(placeholder, withNew, excludeId) {
    return '<option value="">' + esc(placeholder) + '</option>'
      + groups.filter(function (g) { return g.id !== excludeId; }).map(function (g) {
        return '<option value="' + esc(g.id) + '">' + esc(g.name) + ' (' + g.count + ')</option>';
      }).join('')
      + (withNew ? '<option value="__new">+ New group…</option>' : '');
  }

  /** Fill a Group filter <select>, keeping its first option and current choice. */
  function fillFilter(select) {
    if (!select) return;
    var current = select.value;
    var first = select.options[0] ? select.options[0].outerHTML : '<option value="">All groups</option>';
    select.innerHTML = first + groups.map(function (g) {
      return '<option value="' + esc(g.id) + '">' + esc(g.name) + ' (' + g.count + ')</option>';
    }).join('');
    select.value = byId(current) ? current : '';
    var manage = document.getElementById(select.id + '-manage');
    if (manage) manage.classList.toggle('d-none', !select.value);
  }

  /** The Groups block in the person drawer. */
  function drawerSection(detail) {
    var mine = detail.groups || [];
    var mineIds = mine.map(function (g) { return g.id; });
    var available = groups.filter(function (g) { return mineIds.indexOf(g.id) === -1; });
    return '<div class="drawer-section mb-2" id="groups-section" data-app-id="' + esc(detail.id) + '">'
      + '<span class="detail-label">Groups</span>'
      + '<div class="pill-wrap mt-1">'
      + (mine.length
        ? mine.map(function (g) {
          return '<span class="tag-pill tag-pill-group">' + esc(g.name)
            + '<button type="button" class="group-pill-remove" data-action="group-drawer-remove" data-group-id="' + esc(g.id) + '" aria-label="Remove from ' + esc(g.name) + '">&#x2715;</button></span>';
        }).join('')
        : '<span class="text-muted fs-sm">Not in any group</span>')
      + '</div>'
      + '<div class="group-add-row mt-1">'
      + '<select class="as-input" id="drawer-group-select" aria-label="Add to group">'
      + '<option value="">Add to group…</option>'
      + available.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>'; }).join('')
      + '<option value="__new">+ New group…</option>'
      + '</select>'
      + '<input type="text" class="as-input d-none" id="drawer-group-new" maxlength="80" placeholder="Group name, e.g. Good bartenders">'
      + '<button type="button" class="btn btn-ghost btn-sm" data-action="group-drawer-add">Add</button>'
      + '</div>'
      + '</div>';
  }

  // ── Events ──────────────────────────────────────────────
  // A "+ New group…" choice reveals the name box next to its select.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'drawer-group-select' || t.id === 'bulk-group-select') {
      var box = document.getElementById(t.id === 'drawer-group-select' ? 'drawer-group-new' : 'bulk-group-new');
      if (box) {
        box.classList.toggle('d-none', t.value !== '__new');
        if (t.value === '__new') box.focus();
      }
    }
  });

  async function chosenGroupId(selectId, newId) {
    var select = document.getElementById(selectId);
    if (!select || !select.value) { toast('Choose a group', 'warning'); return null; }
    if (select.value !== '__new') return select.value;
    var group = await create(document.getElementById(newId).value);
    return group ? group.id : null;
  }

  document.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-action^="group-"]');
    if (!el) return;
    var action = el.dataset.action;
    var section = el.closest('#groups-section');

    try {
      if (action === 'group-drawer-add' && section) {
        var gid = await chosenGroupId('drawer-group-select', 'drawer-group-new');
        if (!gid) return;
        await addMembers(gid, [section.dataset.appId]);
        toast('Added to ' + (byId(gid) || {}).name, 'success');
      } else if (action === 'group-drawer-remove' && section) {
        await removeMembers(el.dataset.groupId, [section.dataset.appId]);
      } else if (action === 'group-rename') {
        await rename(document.getElementById(el.dataset.select).value);
      } else if (action === 'group-delete') {
        await remove(document.getElementById(el.dataset.select).value);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  window.AdminGroups = {
    load: load,
    list: function () { return groups; },
    byId: byId,
    create: create,
    addMembers: addMembers,
    removeMembers: removeMembers,
    chosenGroupId: chosenGroupId,
    pills: pills,
    optionsHtml: optionsHtml,
    fillFilter: fillFilter,
    drawerSection: drawerSection
  };
}());
