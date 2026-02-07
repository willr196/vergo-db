// Load roles
    async function loadRoles() {
      try {
        const res = await fetch('/api/v1/jobs/meta/roles');
        const payload = await res.json();
        const roles = payload.data ?? payload;
        
        const select = document.getElementById('role-select');
        
        if (roles.length === 0) {
          // Fallback defaults
          const defaults = ['Bartender', 'Waiter', 'Chef', 'Kitchen Porter', 'Catering Assistant', 'Front of House', 'Event Manager'];
          defaults.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name.toLowerCase();
            opt.textContent = name;
            select.appendChild(opt);
          });
        } else {
          roles.forEach(role => {
            const opt = document.createElement('option');
            opt.value = role.id;
            opt.textContent = role.name;
            select.appendChild(opt);
          });
        }
      } catch (err) {
        console.error('Failed to load roles:', err);
      }
    }
    
    // Apply method toggle
    const optEmail = document.getElementById('opt-email');
    const optUrl = document.getElementById('opt-url');
    const fieldsEmail = document.getElementById('fields-email');
    const fieldsUrl = document.getElementById('fields-url');
    
    optEmail.addEventListener('click', () => {
      optEmail.classList.add('active');
      optUrl.classList.remove('active');
      fieldsEmail.classList.add('active');
      fieldsUrl.classList.remove('active');
    });
    
    optUrl.addEventListener('click', () => {
      optUrl.classList.add('active');
      optEmail.classList.remove('active');
      fieldsUrl.classList.add('active');
      fieldsEmail.classList.remove('active');
    });
    
    // Form submission
    const form = document.getElementById('post-job-form');
    const submitBtn = document.getElementById('submit-btn');
    const formAlert = document.getElementById('form-alert');
    const successMessage = document.getElementById('success-message');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Reset errors
      document.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));
      formAlert.classList.remove('active');
      
      // Get form data
      const formData = new FormData(form);
      const data = {
        companyName: formData.get('companyName')?.trim(),
        posterEmail: formData.get('posterEmail')?.trim(),
        title: formData.get('title')?.trim(),
        roleId: formData.get('roleId'),
        location: formData.get('location')?.trim(),
        description: formData.get('description')?.trim(),
        payRateMin: formData.get('payRateMin') ? parseFloat(formData.get('payRateMin')) : undefined,
        payRateMax: formData.get('payRateMax') ? parseFloat(formData.get('payRateMax')) : undefined,
        payType: 'HOURLY',
        confirm: formData.get('confirm') === 'on',
        website: formData.get('website') // Honeypot
      };
      
      // Apply method
      const applyMethod = formData.get('applyMethod');
      if (applyMethod === 'email') {
        data.applyEmail = formData.get('applyEmail')?.trim() || data.posterEmail;
      } else {
        data.externalUrl = formData.get('externalUrl')?.trim();
      }
      
      // Validation
      let hasErrors = false;
      
      if (!data.companyName) {
        document.querySelector('[name="companyName"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (!data.posterEmail || !data.posterEmail.includes('@')) {
        document.querySelector('[name="posterEmail"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (!data.title) {
        document.querySelector('[name="title"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (!data.roleId) {
        document.querySelector('[name="roleId"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (!data.location) {
        document.querySelector('[name="location"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (!data.description || data.description.length < 20) {
        document.querySelector('[name="description"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (applyMethod === 'url' && !data.externalUrl) {
        document.querySelector('[name="externalUrl"]').closest('.form-group').classList.add('has-error');
        hasErrors = true;
      }
      
      if (!data.confirm) {
        formAlert.textContent = 'Please confirm the checkbox to submit.';
        formAlert.classList.add('active');
        hasErrors = true;
      }
      
      if (hasErrors) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      
      // Submit
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      
      try {
        const res = await fetch('/api/v1/jobs/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const payload = await res.json();
        const result = payload.data ?? payload;
        
        if (!res.ok) {
          throw new Error(result.error || result.details?.join(', ') || 'Failed to submit');
        }
        
        // Show success
        form.style.display = 'none';
        successMessage.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
      } catch (err) {
        formAlert.textContent = err.message;
        formAlert.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Job for Review';
      }
    });
    
    // Init
    loadRoles();
