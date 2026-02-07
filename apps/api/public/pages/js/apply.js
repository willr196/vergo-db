// Toggle experience dropdown when role checkbox is ticked
    function toggleExperience(checkbox) {
      const row = checkbox.closest('.role-row');
      const select = row.querySelector('.experience-select');
      if (checkbox.checked) {
        select.disabled = false;
      } else {
        select.disabled = true;
        select.value = '';
      }
    }

    // Wire up experience dropdowns without inline event handlers (CSP-safe).
    document.querySelectorAll('input[name="roles"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => toggleExperience(checkbox));
      // Ensure correct initial state when reloading the page with checked boxes.
      toggleExperience(checkbox);
    });

    function getRolesWithExperience() {
      const roles = [];
      document.querySelectorAll('input[name="roles"]:checked').forEach(checkbox => {
        const roleName = checkbox.value;
        const select = document.querySelector(`.experience-select[data-role="${roleName}"]`);
        const experience = select ? select.value : '';
        roles.push({ role: roleName, experienceLevel: experience });
      });
      return roles;
    }

    // CV Upload state
    let uploadedCvData = null;

    // Helper to show upload status
    function showUploadStatus(message, type) {
      const statusEl = document.getElementById('uploadStatus');
      statusEl.textContent = message;
      statusEl.className = 'upload-status ' + type;
    }

    // Handle CV file selection and upload
    document.getElementById('cvFile').addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) {
        uploadedCvData = null;
        return;
      }

      // Validate file size (10MB max)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        showUploadStatus('File is too large. Maximum size is 10MB.', 'error');
        e.target.value = '';
        uploadedCvData = null;
        return;
      }

      // Validate file type
      const allowedTypes = ['.pdf', '.doc', '.docx'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(ext)) {
        showUploadStatus('Invalid file type. Please upload a PDF, DOC, or DOCX file.', 'error');
        e.target.value = '';
        uploadedCvData = null;
        return;
      }

      try {
        // Step 1: Get presigned URL
        showUploadStatus('Preparing upload...', 'uploading');

        const presignRes = await fetch('/api/v1/applications/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || 'application/octet-stream'
          })
        });

        if (!presignRes.ok) {
          const err = await presignRes.json();
          throw new Error(err.error || 'Failed to prepare upload');
        }

        const { url, key, applicantId } = await presignRes.json();

        // Step 2: Upload file to S3
        showUploadStatus('Uploading CV...', 'uploading');

        const uploadRes = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type || 'application/octet-stream'
          }
        });

        if (!uploadRes.ok) {
          throw new Error('Failed to upload file');
        }

        // Step 3: Verify the upload
        showUploadStatus('Verifying file...', 'uploading');

        const verifyRes = await fetch('/api/v1/applications/verify-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });

        if (!verifyRes.ok) {
          const err = await verifyRes.json();
          throw new Error(err.error || 'File verification failed');
        }

        // Success!
        uploadedCvData = {
          cvKey: key,
          applicantId: applicantId,
          cvOriginalName: file.name,
          cvFileSize: file.size,
          cvMimeType: file.type
        };

        showUploadStatus('CV uploaded successfully!', 'success');

      } catch (error) {
        console.error('CV upload error:', error);
        showUploadStatus(error.message || 'Failed to upload CV. Please try again.', 'error');
        e.target.value = '';
        uploadedCvData = null;
      }
    });

    // Form submission
    document.getElementById('applyForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      // Honeypot check
      if (document.getElementById('website').value) {
        return;
      }

      // Check CV upload
      if (!uploadedCvData) {
        alert('Please upload your CV before submitting.');
        return;
      }

      const form = e.target;
      const formData = new FormData(form);

      // Collect roles with experience
      const selectedRoles = document.querySelectorAll('input[name="roles"]:checked');
      if (selectedRoles.length === 0) {
        alert('Please select at least one role you are applying for.');
        return;
      }

      const rolesWithExp = getRolesWithExperience();

      // Validate experience is selected for each ticked role
      for (const r of rolesWithExp) {
        if (!r.experienceLevel) {
          alert(`Please select experience level for ${r.role}`);
          return;
        }
      }

      const data = {
        applicantId: uploadedCvData.applicantId,
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        roles: rolesWithExp,
        cvKey: uploadedCvData.cvKey,
        cvOriginalName: uploadedCvData.cvOriginalName,
        cvFileSize: uploadedCvData.cvFileSize,
        cvMimeType: uploadedCvData.cvMimeType,
        source: 'website'
      };

      try {
        const response = await fetch('/api/v1/applications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          form.classList.add('d-none');
          document.getElementById('formSuccess').classList.add('active');
        } else {
          const err = await response.json();
          alert(err.error || 'There was a problem submitting your application. Please try again or email us directly at wrobb@vergoltd.com');
        }
      } catch (error) {
        alert('There was a problem submitting your application. Please try again or email us directly at wrobb@vergoltd.com');
      }
    });
