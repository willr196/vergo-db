const API = '/api/v1'
const form = document.getElementById('f')
const cv = document.getElementById('cv')
const submitBtn = form.querySelector('button[type="submit"]')

// Validate file before upload
function validateFile(file) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const validTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (file.size > MAX_SIZE) {
    return 'CV file is too large. Maximum size is 10MB.';
  }
  
  if (!validTypes.includes(file.type)) {
    return 'Please upload a PDF or Word document only.';
  }
  
  return null; // Valid
}

async function presign(file) {
  const r = await fetch(`${API}/applications/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      fileName: file.name, 
      fileType: file.type 
    })
  })
  
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to prepare upload')
  }
  
  return r.json()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const file = cv.files[0]
  if (!file) {
    alert('Please attach your CV')
    return
  }
  
  // Validate file
  const validationError = validateFile(file)
  if (validationError) {
    alert(validationError)
    return
  }
  
  // Check roles selected
  const roles = [...document.querySelectorAll('input[name="roles"]:checked')].map(el => el.value)
  if (roles.length === 0) {
    alert('Please select at least one role you\'re applying for')
    return
  }
  
  try {
    submitBtn.disabled = true
    const originalText = submitBtn.textContent
    
    // Step 1: Get presigned URL
    submitBtn.textContent = 'Preparing upload...'
    const { url, key, applicantId } = await presign(file)
    
    // Step 2: Upload to S3
    submitBtn.textContent = 'Uploading CV...'
    const uploadRes = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type }
    })
    
    if (!uploadRes.ok) {
      throw new Error('Failed to upload CV. Please try again.')
    }
    
    // Step 3: Verify upload (CRITICAL SECURITY STEP!)
    submitBtn.textContent = 'Verifying file...'
    const verifyRes = await fetch(`${API}/applications/verify-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })
    
    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}))
      throw new Error(errData.error || 'File verification failed')
    }
    
    // Step 4: Submit application
    submitBtn.textContent = 'Submitting application...'
    const fd = new FormData(form)
    const payload = Object.fromEntries(fd.entries())
    payload.roles = roles
    payload.cvKey = key
    payload.applicantId = applicantId
    payload.cvOriginalName = file.name
    payload.source = 'website'
    
    const res = await fetch(`${API}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      const payload = await res.json()
      const data = payload.data ?? payload
      alert('✓ Application received!\n\nWe\'ll review your application and get back to you within 2 weeks.')
      form.reset()
      submitBtn.textContent = originalText
      submitBtn.disabled = false
    } else {
      const payload = await res.json().catch(() => ({}))
      const errData = payload.data ?? payload
      throw new Error(errData.error || 'Application submission failed')
    }
    
  } catch (err) {
    console.error('Application error:', err)
    alert('❌ Error: ' + err.message + '\n\nPlease try again or contact us if the problem persists.')
    submitBtn.disabled = false
    submitBtn.textContent = 'Submit Application'
  }
})

// Show file info when selected
cv.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (file) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2)
    console.log(`Selected: ${file.name} (${sizeMB}MB)`)
  }
})
