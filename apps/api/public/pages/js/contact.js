// Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // Show corresponding panel
        const tabName = this.dataset.tab;
        document.querySelectorAll('.form-panel').forEach(panel => panel.classList.remove('active'));
        document.getElementById(tabName + 'Panel').classList.add('active');

        // Hide success message if visible
        document.getElementById('formSuccess').classList.remove('active');
      });
    });

    // Staff Request Form submission
    document.getElementById('staffForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      // Honeypot check
      if (document.getElementById('staff-website').value) return;

      const form = e.target;
      const formData = new FormData(form);

      // Collect checkbox values
      const roles = [];
      form.querySelectorAll('input[name="roles"]:checked').forEach(cb => {
        roles.push(cb.value);
      });

      if (roles.length === 0) {
        alert('Please select at least one role.');
        return;
      }

      const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        company: formData.get('company'),
        roles: roles,
        date: formData.get('date') || undefined,
        staffCount: parseInt(formData.get('staffCount')),
        message: formData.get('message')
      };

      try {
        const response = await fetch('/api/v1/contact/staff-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          document.getElementById('staffPanel').style.display = 'none';
          document.getElementById('formSuccess').classList.add('active');
        } else {
          const result = await response.json();
          alert(result.error || 'There was a problem submitting your request. Please try again or email us directly.');
        }
      } catch (error) {
        alert('There was a problem submitting your request. Please try again or email us directly.');
      }
    });

    // General Contact Form submission
    document.getElementById('generalForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      // Honeypot check
      if (document.getElementById('general-website').value) return;

      const form = e.target;
      const formData = new FormData(form);

      const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message')
      };

      try {
        const response = await fetch('/api/v1/contact/general', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          document.getElementById('generalPanel').style.display = 'none';
          document.getElementById('formSuccess').classList.add('active');
        } else {
          const result = await response.json();
          alert(result.error || 'There was a problem sending your message. Please try again or email us directly.');
        }
      } catch (error) {
        alert('There was a problem sending your message. Please try again or email us directly.');
      }
    });

    // Set minimum date to today for date fields
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('staff-date').setAttribute('min', today);
