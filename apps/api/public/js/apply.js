const API = '/api/v1'
const form = document.getElementById('f')
const cv = document.getElementById('cv')

async function presign(file){
  const r = await fetch(`${API}/applications/presign`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ fileName:file.name, fileType:file.type })
  })
  return r.json()
}

form.addEventListener('submit', async (e)=>{
  e.preventDefault()
  const file = cv.files[0]
  if(!file){ alert('Please attach your CV'); return }

  const { url, key, applicantId } = await presign(file)
  await fetch(url, { method:'PUT', body:file, headers: { 'Content-Type': file.type } })

  const fd = new FormData(form)
  const roles = [...document.querySelectorAll('input[name="roles"]:checked')].map(el=>el.value)
  const payload = Object.fromEntries(fd.entries())
  payload.roles = roles
  payload.cvKey = key
  payload.applicantId = applicantId
  payload.cvOriginalName = file.name   

  const res = await fetch(`${API}/applications`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  })
  if(res.ok){ alert('Thanks — application received!'); form.reset() }
  else { alert('Something went wrong.') }
})
