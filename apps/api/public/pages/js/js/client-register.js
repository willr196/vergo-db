const form = document.getElementById('register-form');
    const msgBox = document.getElementById('message');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = form.querySelector('button');
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      // Validate passwords match
      if (password !== confirmPassword) {
        msgBox.innerHTML = '<div class="error-msg">Passwords do not match</div>';
        return;
      }
      
      btn.disabled = true;
      btn.textContent = 'Creating account...';
      msgBox.innerHTML = '';
      
      const formData = {
        companyName: document.getElementById('companyName').value.trim(),
        industry: document.getElementById('industry').value,
        companySize: document.getElementById('companySize').value,
        website: document.getElementById('website').value.trim(),
        contactName: document.getElementById('contactName').value.trim(),
        jobTitle: document.getElementById('jobTitle').value.trim(),
        email: document.getElementById('email').value.trim().toLowerCase(),
        phone: document.getElementById('phone').value.trim(),
        password: password
      };
      
      try {
        const res = await fetch('/api/v1/clients/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok && !data.ok) {
          throw new Error(data.error || 'Registration failed');
        }
        
        // Success
        form.style.display = 'none';
        msgBox.innerHTML = `
          <div class="success-msg">
            <strong>Registration successful!</strong><br><br>
            Please check your email to verify your account. Once verified, our team will review your application and you'll receive confirmation within 24 hours.
          </div>
        `;
        
      } catch (err) {
        msgBox.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create Company Account';
      }
    });
    
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
