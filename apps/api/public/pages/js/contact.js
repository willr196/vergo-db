    (function () {
      'use strict';

      const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
      const staffPanel = document.getElementById('staffPanel');
      const generalPanel = document.getElementById('generalPanel');
      const formSuccess = document.getElementById('formSuccess');
      const staffForm = document.getElementById('staffForm');
      const generalForm = document.getElementById('generalForm');
      const roleCheckboxes = Array.from(document.querySelectorAll('.role-request-checkbox'));
      const otherRoleInput = document.getElementById('staff-role-other');

      if (!staffPanel || !generalPanel || !formSuccess || !staffForm || !generalForm) {
        return;
      }

      function parsePositiveInt(value) {
        const parsed = Number.parseInt(String(value || ''), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      }

      function restorePanels() {
        staffPanel.style.display = '';
        generalPanel.style.display = '';
      }

      function activateTab(tabName) {
        tabButtons.forEach((button) => {
          const isActive = button.dataset.tab === tabName;
          button.classList.toggle('active', isActive);
        });

        document.querySelectorAll('.form-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.id === tabName + 'Panel');
        });

        restorePanels();
        formSuccess.classList.remove('active');
      }

      function showSuccess(panel) {
        restorePanels();
        panel.style.display = 'none';
        formSuccess.classList.add('active');
      }

      function syncRoleRow(checkbox) {
        const row = checkbox.closest('.role-request-item');
        if (!row) return;

        const countInput = row.querySelector('.role-count-input');
        const otherInput = row.querySelector('.role-other-input');

        row.classList.toggle('is-inactive', !checkbox.checked);

        if (countInput) {
          countInput.disabled = !checkbox.checked;
          if (!checkbox.checked) countInput.value = '';
        }

        if (otherInput) {
          otherInput.disabled = !checkbox.checked;
          if (!checkbox.checked) otherInput.value = '';
        }
      }

      function collectRoleSelections() {
        const selections = [];
        let countedTotal = 0;

        roleCheckboxes.forEach((checkbox) => {
          if (!checkbox.checked) return;

          const row = checkbox.closest('.role-request-item');
          const countInput = row ? row.querySelector('.role-count-input') : null;
          const otherInput = row ? row.querySelector('.role-other-input') : null;
          const count = countInput ? parsePositiveInt(countInput.value) : 0;
          let label = checkbox.value;

          if (checkbox.value === 'Other') {
            const otherLabel = otherInput ? otherInput.value.trim() : '';
            if (!otherLabel) {
              throw new Error('Please describe the other role.');
            }
            label = 'Other: ' + otherLabel;
          }

          countedTotal += count;
          selections.push({ label, count });
        });

        return { selections, countedTotal };
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', function () {
          activateTab(this.dataset.tab || 'staff');
        });
      });

      roleCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', function () {
          syncRoleRow(this);
        });
        syncRoleRow(checkbox);
      });

      staffForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (document.getElementById('staff-website').value) return;

        const formData = new FormData(staffForm);
        const approximateStaffCount = parsePositiveInt(formData.get('staffCount'));
        let selections;
        let countedTotal;

        try {
          ({ selections, countedTotal } = collectRoleSelections());
        } catch (error) {
          alert(error.message || 'Please check the selected roles.');
          return;
        }

        if (!selections.length) {
          alert('Please select at least one role.');
          return;
        }

        if (!approximateStaffCount && !countedTotal) {
          alert('Please add an approximate total or at least one role quantity.');
          return;
        }

        const roleLabels = selections.map((selection) => {
          return selection.count > 0 ? selection.label + ' x' + selection.count : selection.label;
        });
        const roleBreakdown = selections
          .filter((selection) => selection.count > 0)
          .map((selection) => '- ' + selection.label + ': ' + selection.count);
        const messageParts = [];
        const brief = String(formData.get('message') || '').trim();
        const effectiveStaffCount = countedTotal || approximateStaffCount;

        if (approximateStaffCount) {
          messageParts.push('Approximate total staff: ' + approximateStaffCount);
        }
        if (roleBreakdown.length) {
          messageParts.push('Role breakdown:\n' + roleBreakdown.join('\n'));
        }
        if (brief) {
          messageParts.push(brief);
        }

        const data = {
          name: formData.get('name'),
          email: formData.get('email'),
          phone: formData.get('phone') || undefined,
          company: formData.get('company'),
          roles: roleLabels,
          date: formData.get('date') || undefined,
          staffCount: effectiveStaffCount,
          message: messageParts.join('\n\n'),
          website: formData.get('website') || undefined,
        };

        try {
          const response = await fetch('/api/v1/contact/staff-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(result.error || 'There was a problem submitting your request. Please try again or email us directly.');
          }

          showSuccess(staffPanel);
        } catch (error) {
          alert(error.message || 'There was a problem submitting your request. Please try again or email us directly.');
        }
      });

      generalForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (document.getElementById('general-website').value) return;

        const formData = new FormData(generalForm);
        const data = {
          name: formData.get('name'),
          email: formData.get('email'),
          subject: formData.get('subject'),
          message: formData.get('message'),
          website: formData.get('website') || undefined,
        };

        try {
          const response = await fetch('/api/v1/contact/general', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(result.error || 'There was a problem sending your message. Please try again or email us directly.');
          }

          showSuccess(generalPanel);
        } catch (error) {
          alert(error.message || 'There was a problem sending your message. Please try again or email us directly.');
        }
      });

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('staff-date').setAttribute('min', today);

      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'general') {
        activateTab('general');
      } else {
        activateTab('staff');
      }

      if (otherRoleInput) {
        otherRoleInput.addEventListener('input', function () {
          if (this.value.trim()) return;
          const otherCheckbox = staffForm.querySelector('.role-request-checkbox[value="Other"]');
          if (otherCheckbox && !otherCheckbox.checked) {
            this.value = '';
          }
        });
      }
    })();
