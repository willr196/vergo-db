const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    // Check if token exists
    if (!token) {
      document.getElementById('content').innerHTML = `
        <div class="invalid-token">
          <h2>Invalid Link</h2>
          <p>This password reset link is invalid or has expired.</p>
          <a href="forgot-password" class="btn">Request New Link</a>
        </div>
      `;
    } else {
      const form = document.getElementById('reset-form');
      const msgBox = document.getElementById('message');
      
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = form.querySelector('button');
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
          msgBox.innerHTML = '<div class="error-msg">Passwords do not match</div>';
          return;
        }
        
        if (password.length < 8) {
          msgBox.innerHTML = '<div class="error-msg">Password must be at least 8 characters</div>';
          return;
        }
        
        btn.disabled = true;
        btn.textContent = 'Resetting...';
        msgBox.innerHTML = '';
        
        try {
          const res = await fetch('/api/v1/user/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
          });
          
          const payload = await res.json();
          const data = payload.data ?? payload;
          
	          if (!res.ok) {
	            throw new Error(data.error || 'Reset failed');
	          }
	          
	          document.getElementById('content').innerHTML = `
	            <div style="text-align: center;">
	              <h1 style="color: var(--color-success); margin-bottom: 15px;">✓ Password Reset</h1>
	              <p style="color: var(--color-text-muted); margin-bottom: 30px;">Your password has been successfully reset.</p>
	              <a href="user-login" class="btn">Log In</a>
	            </div>
	          `;
	          
	        } catch (err) {
	          const message = (err && err.message) ? err.message : 'Reset failed';
	          msgBox.innerHTML = '';
	          const el = document.createElement('div');
	          el.className = 'error-msg';
	          el.textContent = message;
	          msgBox.appendChild(el);
	          btn.disabled = false;
	          btn.textContent = 'Reset Password';
	        }
	      });
	    }
