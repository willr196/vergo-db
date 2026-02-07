const form = document.getElementById('login-form');
    const msgBox = document.getElementById('message');
    
    // Check for URL params
    const params = new URLSearchParams(window.location.search);
    
    // Show verification success
    if (params.get('verified') === 'true') {
      msgBox.innerHTML = '<div class="success-msg">Email verified! Your account is now pending approval. We\'ll email you once it\'s been reviewed.</div>';
    } else if (params.get('verified') === 'already') {
      msgBox.innerHTML = '<div class="info-msg">Your email was already verified. If your account is approved, you can log in below.</div>';
    }
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = form.querySelector('button');
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      
      btn.disabled = true;
      btn.textContent = 'Logging in...';
      msgBox.innerHTML = '';
      
      try {
        const res = await fetch('/api/v1/clients/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok) {
          // Handle specific error codes
          if (data.code === 'EMAIL_NOT_VERIFIED') {
            msgBox.innerHTML = `<div class="info-msg">${escapeHtml(data.error)}</div>`;
          } else if (data.code === 'PENDING_APPROVAL') {
            msgBox.innerHTML = `<div class="info-msg">${escapeHtml(data.error)}</div>`;
          } else {
            throw new Error(data.error || 'Login failed');
          }
          btn.disabled = false;
          btn.textContent = 'Log In';
          return;
        }
        
        // Success - redirect to dashboard
        window.location.href = '/client-dashboard.html';
        
      } catch (err) {
        msgBox.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Log In';
      }
    });
    
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
