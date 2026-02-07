const form = document.getElementById('register-form');
    const msgBox = document.getElementById('message');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = form.querySelector('button');
      const firstName = document.getElementById('firstName').value.trim();
      const lastName = document.getElementById('lastName').value.trim();

      const formData = {
        // Company
        companyName: document.getElementById('companyName').value.trim(),
        companyWebsite: document.getElementById('companyWebsite').value.trim() || undefined,
        vatNumber: document.getElementById('vatNumber').value.trim() || undefined,
        industry: document.getElementById('industry').value,
        // Contact - combine firstName + lastName into contactName for backend
        contactName: `${firstName} ${lastName}`,
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        // Password
        password: document.getElementById('password').value
      };
      
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      // Validate passwords
      if (formData.password !== confirmPassword) {
        msgBox.innerHTML = '<div class="error-msg">Passwords do not match</div>';
        return;
      }
      
      if (formData.password.length < 8) {
        msgBox.innerHTML = '<div class="error-msg">Password must be at least 8 characters</div>';
        return;
      }
      
      btn.disabled = true;
      btn.textContent = 'Creating account...';
      msgBox.innerHTML = '';
      
      try {
        const res = await fetch('/api/v1/client/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
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
            ${escapeHtml(data.message || 'Please check your email to verify your account. Once verified, our team will review your application and activate your client access.')}
          </div>
        `;
        form.style.display = 'none';
        
      } catch (err) {
        msgBox.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create Client Account';
      }
    });
    
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
