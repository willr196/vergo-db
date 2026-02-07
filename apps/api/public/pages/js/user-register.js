const form = document.getElementById('register-form');
    const msgBox = document.getElementById('message');
    
    // Get redirect URL if present
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || 'jobs.html';
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = form.querySelector('button');
      const firstName = document.getElementById('firstName').value.trim();
      const lastName = document.getElementById('lastName').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      // Validate
      if (password !== confirmPassword) {
        msgBox.innerHTML = '<div class="error-msg">Passwords do not match</div>';
        return;
      }
      
      if (password.length < 8) {
        msgBox.innerHTML = '<div class="error-msg">Password must be at least 8 characters</div>';
        return;
      }
      
      btn.disabled = true;
      btn.textContent = 'Creating account...';
      msgBox.innerHTML = '';
      
      try {
        const res = await fetch('/api/v1/user/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, phone: phone || undefined, password })
        });
        
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok && res.status !== 200) {
          throw new Error(data.error || 'Registration failed');
        }
        
        // Success
        msgBox.innerHTML = `
          <div class="success-msg">
            <strong>Account created!</strong><br>
            Please check your email to verify your account before logging in.
          </div>
        `;
        form.style.display = 'none';
        
      } catch (err) {
        msgBox.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
    
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
