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

    const UPLOADED_CV_STORAGE_KEY = 'vergo_uploaded_cv';
    const UPLOADED_CV_TTL_MS = 10 * 60 * 1000;

    // CV Upload state
    let uploadedCvData = null;
    let cvUploadInFlight = false;
    let cvUploadToken = 0;

    function persistUploadedCvData(data) {
      try {
        if (!data) {
          sessionStorage.removeItem(UPLOADED_CV_STORAGE_KEY);
          return;
        }

        sessionStorage.setItem(UPLOADED_CV_STORAGE_KEY, JSON.stringify({
          ...data,
          storedAt: Date.now()
        }));
      } catch (_error) {
        // Ignore storage failures; the in-memory state still supports submission.
      }
    }

    function clearUploadedCvData() {
      uploadedCvData = null;
      persistUploadedCvData(null);
    }

    function formatFileSize(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '';
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${bytes} B`;
    }

    function buildUploadedCvMessage(data) {
      const fileName = data?.cvOriginalName || 'Uploaded CV';
      const sizeLabel = formatFileSize(Number(data?.cvFileSize || 0));
      return sizeLabel ? `CV ready: ${fileName} (${sizeLabel})` : `CV ready: ${fileName}`;
    }

    function setUploadedCvData(data) {
      uploadedCvData = data;
      persistUploadedCvData(data);
      showUploadStatus(buildUploadedCvMessage(data), 'success');
    }

    function restoreUploadedCvData() {
      try {
        const raw = sessionStorage.getItem(UPLOADED_CV_STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        const storedAt = Number(parsed?.storedAt || 0);
        if (!storedAt || (Date.now() - storedAt) > UPLOADED_CV_TTL_MS) {
          sessionStorage.removeItem(UPLOADED_CV_STORAGE_KEY);
          return;
        }

        uploadedCvData = {
          applicantId: parsed.applicantId,
          cvKey: parsed.cvKey,
          cvOriginalName: parsed.cvOriginalName,
          cvFileSize: Number(parsed.cvFileSize || 0),
          cvMimeType: parsed.cvMimeType
        };

        showUploadStatus(buildUploadedCvMessage(uploadedCvData), 'success');
      } catch (_error) {
        sessionStorage.removeItem(UPLOADED_CV_STORAGE_KEY);
      }
    }

    // Helper to show upload status
    function showUploadStatus(message, type) {
      const statusEl = document.getElementById('uploadStatus');
      statusEl.textContent = message;
      statusEl.className = 'upload-status ' + type;
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read the selected file.'));
        reader.readAsDataURL(file);
      });
    }

    async function uploadCvDirect(file) {
      showUploadStatus('Attaching CV...', 'uploading');
      const contentBase64 = await readFileAsDataUrl(file);
      const response = await fetch('/api/v1/applications/direct-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          contentBase64
        })
      });
      const payload = await response.json().catch(() => ({}));
      const data = payload.data ?? payload;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload file');
      }

      return data;
    }

    restoreUploadedCvData();

    const cvFileInput = document.getElementById('cvFile');

    // Handle CV file selection and upload
    cvFileInput.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) {
        if (!uploadedCvData && !cvUploadInFlight) {
          showUploadStatus('', '');
        }
        return;
      }

      const uploadToken = ++cvUploadToken;
      cvUploadInFlight = true;
      clearUploadedCvData();

      // Validate file size (10MB max)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        showUploadStatus('File is too large. Maximum size is 10MB.', 'error');
        e.target.value = '';
        clearUploadedCvData();
        cvUploadInFlight = false;
        return;
      }

      // Validate file type
      const allowedTypes = ['.pdf', '.doc', '.docx'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(ext)) {
        showUploadStatus('Invalid file type. Please upload a PDF, DOC, or DOCX file.', 'error');
        e.target.value = '';
        clearUploadedCvData();
        cvUploadInFlight = false;
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

        let key;
        let applicantId;
        let resolvedMimeType = file.type || 'application/octet-stream';

        if (!presignRes.ok) {
          const errPayload = await presignRes.json().catch(() => ({}));
          const err = errPayload.data ?? errPayload;

          if (err.code === 'DIRECT_UPLOAD_REQUIRED') {
            const directUpload = await uploadCvDirect(file);
            if (uploadToken !== cvUploadToken) return;
            key = directUpload.key;
            applicantId = directUpload.applicantId;
            resolvedMimeType = directUpload.fileType || resolvedMimeType;
          } else {
            throw new Error(err.error || 'Failed to prepare upload');
          }
        } else {
          const presignPayloadRaw = await presignRes.json();
          const presignPayload = presignPayloadRaw.data ?? presignPayloadRaw;
          const url = presignPayload.url;
          key = presignPayload.key;
          applicantId = presignPayload.applicantId;
          let uploadedViaDirectFallback = false;

          // Step 2: Upload file to S3
          showUploadStatus('Uploading CV...', 'uploading');

          try {
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
          } catch (uploadError) {
            console.warn('Presigned CV upload failed, falling back to direct upload.', uploadError);
            showUploadStatus('Retrying upload...', 'uploading');
            const directUpload = await uploadCvDirect(file);
            if (uploadToken !== cvUploadToken) return;
            key = directUpload.key;
            applicantId = directUpload.applicantId;
            resolvedMimeType = directUpload.fileType || resolvedMimeType;
            uploadedViaDirectFallback = true;
          }

          if (!uploadedViaDirectFallback) {
            // Step 3: Verify the upload
            showUploadStatus('Verifying file...', 'uploading');

            const verifyRes = await fetch('/api/v1/applications/verify-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key })
            });

            if (!verifyRes.ok) {
              const err = await verifyRes.json().catch(() => ({}));
              throw new Error(err.error || 'File verification failed');
            }

            const verifyPayloadRaw = await verifyRes.json().catch(() => ({}));
            const verifyPayload = verifyPayloadRaw.data ?? verifyPayloadRaw;
            resolvedMimeType = verifyPayload.fileType || resolvedMimeType;
          }
        }

        if (uploadToken !== cvUploadToken) {
          return;
        }

        // Success!
        setUploadedCvData({
          cvKey: key,
          applicantId: applicantId,
          cvOriginalName: file.name,
          cvFileSize: file.size,
          cvMimeType: resolvedMimeType
        });

      } catch (error) {
        if (uploadToken !== cvUploadToken) {
          return;
        }
        console.error('CV upload error:', error);
        showUploadStatus(error.message || 'Failed to upload CV. Please try again.', 'error');
        e.target.value = '';
        clearUploadedCvData();
      } finally {
        if (uploadToken === cvUploadToken) {
          cvUploadInFlight = false;
        }
      }
    });

    // Form submission
    document.getElementById('applyForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      // Honeypot check
      if (document.getElementById('website').value) {
        return;
      }

      if (cvUploadInFlight) {
        alert('Please wait for your CV upload to finish.');
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
        dateOfBirth: formData.get('dateOfBirth') || undefined,
        postcode: formData.get('postcode') || undefined,
        bio: formData.get('bio') || undefined,
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
          clearUploadedCvData();
          cvFileInput.value = '';
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
