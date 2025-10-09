// Prompt once and remember
const ADMIN_TOKEN =
  localStorage.getItem('ADMIN_TOKEN') || prompt('Enter admin token (from .env ADMIN_TOKEN):')
if (!ADMIN_TOKEN) { alert('Admin token required'); throw new Error('No admin token') }
localStorage.setItem('ADMIN_TOKEN', ADMIN_TOKEN)

function authedFetch(url, opts = {}) {
  const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + ADMIN_TOKEN })
  return fetch(url, { ...opts, headers })
}

async function load(){
  const r = await authedFetch('/api/v1/applications')
  if (r.status === 401) {
    alert('Unauthorized: wrong or missing admin token')
    localStorage.removeItem('ADMIN_TOKEN')
    location.reload()
    return
  }
  const rows = await r.json()

  const tbody = document.querySelector('#t tbody')
  tbody.innerHTML = ''
  for (const row of rows) {
    const tr = document.createElement('tr')
    const when = new Date(row.createdAt).toLocaleString()
    const name = `${row.firstName} ${row.lastName}`.trim()
    tr.innerHTML = `
      <td>${when}</td>
      <td>${name}</td>
      <td>${row.phone || ''}</td>
      <td>${row.email}</td>
      <td>${(row.roles || []).join(', ')}</td>
      <td><button data-id="${row.id}">View</button></td>
    `
    tbody.appendChild(tr)
  }

  // open CV
  tbody.addEventListener('click', async (e)=>{
    if (e.target.tagName === 'BUTTON') {
      const id = e.target.getAttribute('data-id')
      const resp = await authedFetch(`/api/v1/applications/${id}/cv`)
      if (resp.status === 401) { alert('Unauthorized'); return }
      const { url } = await resp.json()
      window.open(url, '_blank')
    }
  })
}

load()

