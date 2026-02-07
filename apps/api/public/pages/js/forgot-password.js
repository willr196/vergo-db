const form = document.getElementById('forgot-form');
    const msgBox = document.getElementById('message');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = form.querySelector('button');
      const email = document.getElementById('email').value.trim();
      
      btn.disabled = true;
      btn.textContent = 'Sending...';
      msgBox.innerHTML = '';
      
      try {
        const res = await fetch('/api/v1/user/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        msgBox.innerHTML = '<div class="info-msg">If an account exists with this email, you will receive a password reset link shortly.</div>';
        form.style.display = 'none';
        
      } catch (err) {
        msgBox.innerHTML = '<div class="error-msg">Something went wrong. Please try again.</div>';
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    });
