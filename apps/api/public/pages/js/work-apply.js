(function () {
  'use strict';

  var form = document.getElementById('applyForm');
  if (!form) return;

  // Toggle experience dropdown when role checkbox is ticked
  function toggleExperience(checkbox) {
    var row = checkbox.closest('.role-row');
    var select = row.querySelector('.experience-select');
    if (checkbox.checked) {
      select.disabled = false;
    } else {
      select.disabled = true;
      select.value = '';
    }
  }

  document.querySelectorAll('input[name="roles"]').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () { toggleExperience(checkbox); });
    toggleExperience(checkbox);
  });

  function getRolesWithExperience() {
    var roles = [];
    document.querySelectorAll('input[name="roles"]:checked').forEach(function (checkbox) {
      var roleName = checkbox.value;
      var select = document.querySelector('.experience-select[data-role="' + roleName + '"]');
      var experience = select ? select.value : '';
      roles.push({ role: roleName, experienceLevel: experience });
    });
    return roles;
  }

  var UPLOADED_CV_STORAGE_KEY = 'vergo_uploaded_cv';
  var UPLOADED_CV_TTL_MS = 10 * 60 * 1000;

  var uploadedCvData = null;
  var cvUploadInFlight = false;
  var cvUploadToken = 0;
  var selectedCvFile = null;

  function persistUploadedCvData(data) {
    try {
      if (!data) {
        sessionStorage.removeItem(UPLOADED_CV_STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(UPLOADED_CV_STORAGE_KEY, JSON.stringify(Object.assign({}, data, { storedAt: Date.now() })));
    } catch (_error) {
      // Ignore storage failures; in-memory state still supports submission.
    }
  }

  function getCvFileInput() {
    return document.getElementById('cvFile');
  }

  function syncCvFileRequirement() {
    var input = getCvFileInput();
    if (!input) return;
    input.required = !uploadedCvData && !selectedCvFile;
  }

  function clearUploadedCvData() {
    uploadedCvData = null;
    persistUploadedCvData(null);
    syncCvFileRequirement();
  }

  function clearSelectedCvFile() {
    selectedCvFile = null;
  }

  function restoreSelectedCvFile() {
    var input = getCvFileInput();
    if (!input || !selectedCvFile || (input.files && input.files.length)) return;
    if (typeof DataTransfer !== 'function') return;
    try {
      var transfer = new DataTransfer();
      transfer.items.add(selectedCvFile);
      input.files = transfer.files;
    } catch (_error) {
      // Best-effort only; submission still works from in-memory upload state.
    }
  }

  function formatFileSize(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
  }

  function buildUploadedCvMessage(data) {
    var fileName = (data && data.cvOriginalName) || 'Uploaded CV';
    var sizeLabel = formatFileSize(Number((data && data.cvFileSize) || 0));
    return sizeLabel ? 'CV ready: ' + fileName + ' (' + sizeLabel + ')' : 'CV ready: ' + fileName;
  }

  function showUploadStatus(message, state) {
    var statusEl = document.getElementById('uploadStatus');
    statusEl.textContent = message;
    statusEl.dataset.state = state;
  }

  function setUploadedCvData(data) {
    uploadedCvData = data;
    persistUploadedCvData(data);
    syncCvFileRequirement();
    restoreSelectedCvFile();
    showUploadStatus(buildUploadedCvMessage(data), 'success');
  }

  function restoreUploadedCvData() {
    try {
      var raw = sessionStorage.getItem(UPLOADED_CV_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      var storedAt = Number(parsed.storedAt || 0);
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
      syncCvFileRequirement();
      showUploadStatus(buildUploadedCvMessage(uploadedCvData), 'success');
    } catch (_error) {
      sessionStorage.removeItem(UPLOADED_CV_STORAGE_KEY);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Failed to read the selected file.')); };
      reader.readAsDataURL(file);
    });
  }

  function uploadCvDirect(file) {
    showUploadStatus('Attaching CV...', 'pending');
    return readFileAsDataUrl(file).then(function (contentBase64) {
      return fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.applicationsDirectUploadEndpoint) || '/api/v1/applications/direct-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: file.type || 'application/octet-stream', contentBase64: contentBase64 })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          var data = payload.data || payload;
          if (!response.ok) throw new Error(data.error || 'Failed to upload file');
          return data;
        });
      });
    });
  }

  restoreUploadedCvData();

  var cvFileInput = getCvFileInput();
  syncCvFileRequirement();

  cvFileInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) {
      clearSelectedCvFile();
      if (!uploadedCvData && !cvUploadInFlight) showUploadStatus('', '');
      return;
    }

    selectedCvFile = file;
    var uploadToken = ++cvUploadToken;
    cvUploadInFlight = true;
    clearUploadedCvData();

    var maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showUploadStatus('File is too large. Maximum size is 10MB.', 'error');
      clearSelectedCvFile();
      e.target.value = '';
      clearUploadedCvData();
      cvUploadInFlight = false;
      return;
    }

    var allowedTypes = ['.pdf', '.doc', '.docx'];
    var ext = '.' + file.name.split('.').pop().toLowerCase();
    if (allowedTypes.indexOf(ext) === -1) {
      showUploadStatus('Invalid file type. Please upload a PDF, DOC, or DOCX file.', 'error');
      clearSelectedCvFile();
      e.target.value = '';
      clearUploadedCvData();
      cvUploadInFlight = false;
      return;
    }

    showUploadStatus('Preparing upload...', 'pending');

    fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.applicationsPresignEndpoint) || '/api/v1/applications/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, fileType: file.type || 'application/octet-stream' })
    }).then(function (presignRes) {
      if (!presignRes.ok) {
        return presignRes.json().catch(function () { return {}; }).then(function (errPayload) {
          var err = errPayload.data || errPayload;
          if (err.code === 'DIRECT_UPLOAD_REQUIRED') {
            return uploadCvDirect(file).then(function (directUpload) {
              if (uploadToken !== cvUploadToken) return null;
              return { key: directUpload.key, applicantId: directUpload.applicantId, mimeType: directUpload.fileType || file.type };
            });
          }
          throw new Error(err.error || 'Failed to prepare upload');
        });
      }
      return presignRes.json().then(function (presignPayloadRaw) {
        var presignPayload = presignPayloadRaw.data || presignPayloadRaw;
        var url = presignPayload.url;
        var key = presignPayload.key;
        var applicantId = presignPayload.applicantId;

        showUploadStatus('Uploading CV...', 'pending');

        return fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' }
        }).then(function (uploadRes) {
          if (!uploadRes.ok) throw new Error('Failed to upload file');

          showUploadStatus('Verifying file...', 'pending');
          return fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.applicationsVerifyUploadEndpoint) || '/api/v1/applications/verify-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key })
          }).then(function (verifyRes) {
            if (!verifyRes.ok) {
              return verifyRes.json().catch(function () { return {}; }).then(function (err) {
                throw new Error(err.error || 'File verification failed');
              });
            }
            return verifyRes.json().catch(function () { return {}; }).then(function (verifyPayloadRaw) {
              var verifyPayload = verifyPayloadRaw.data || verifyPayloadRaw;
              return { key: key, applicantId: applicantId, mimeType: verifyPayload.fileType || file.type };
            });
          });
        }).catch(function (uploadError) {
          showUploadStatus('Retrying upload...', 'pending');
          return uploadCvDirect(file).then(function (directUpload) {
            if (uploadToken !== cvUploadToken) return null;
            return { key: directUpload.key, applicantId: directUpload.applicantId, mimeType: directUpload.fileType || file.type };
          });
        });
      });
    }).then(function (result) {
      if (!result || uploadToken !== cvUploadToken) return;
      setUploadedCvData({
        cvKey: result.key,
        applicantId: result.applicantId,
        cvOriginalName: file.name,
        cvFileSize: file.size,
        cvMimeType: result.mimeType
      });
    }).catch(function (error) {
      if (uploadToken !== cvUploadToken) return;
      showUploadStatus(error.message || 'Failed to upload CV. Please try again.', 'error');
      clearSelectedCvFile();
      cvFileInput.value = '';
      clearUploadedCvData();
    }).finally(function () {
      if (uploadToken === cvUploadToken) {
        cvUploadInFlight = false;
        if (uploadedCvData) restoreSelectedCvFile();
      }
    });
  });

  var statusBox = document.getElementById('applyStatus');
  function showFormStatus(message, state) {
    statusBox.textContent = message;
    statusBox.dataset.state = state;
    statusBox.hidden = false;
  }

  var submitBtn = document.getElementById('applySubmit');
  var rolesError = document.getElementById('roles-error');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (form.website.value) return; // honeypot triggered, silently drop

    if (cvUploadInFlight) {
      showFormStatus('Please wait for your CV upload to finish.', 'error');
      return;
    }

    if (!uploadedCvData) {
      showFormStatus('Please upload your CV before submitting.', 'error');
      return;
    }

    var selectedRoles = document.querySelectorAll('input[name="roles"]:checked');
    if (selectedRoles.length === 0) {
      rolesError.textContent = 'Please select at least one role you are applying for.';
      rolesError.style.display = 'block';
      return;
    }

    var rolesWithExp = getRolesWithExperience();
    for (var i = 0; i < rolesWithExp.length; i++) {
      if (!rolesWithExp[i].experienceLevel) {
        rolesError.textContent = 'Please select an experience level for ' + rolesWithExp[i].role + '.';
        rolesError.style.display = 'block';
        return;
      }
    }
    rolesError.style.display = 'none';

    var availability = Array.prototype.slice.call(form.querySelectorAll('input[name="availability"]:checked')).map(function (el) {
      return el.value;
    });

    var bioParts = [];
    if (form.bio.value) bioParts.push(form.bio.value);
    if (availability.length) bioParts.push('Availability: ' + availability.join(', '));

    var data = {
      applicantId: uploadedCvData.applicantId,
      firstName: form.firstName.value,
      lastName: form.lastName.value,
      email: form.email.value,
      phone: form.phone.value || undefined,
      postcode: form.postcode.value || undefined,
      bio: bioParts.join(' — ') || undefined,
      roles: rolesWithExp,
      cvKey: uploadedCvData.cvKey,
      cvOriginalName: uploadedCvData.cvOriginalName,
      cvFileSize: uploadedCvData.cvFileSize,
      cvMimeType: uploadedCvData.cvMimeType,
      source: 'website'
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.applicationsEndpoint) || '/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error(payload.error || 'There was a problem submitting your application.');
        return payload;
      });
    }).then(function () {
      clearSelectedCvFile();
      clearUploadedCvData();
      cvFileInput.value = '';
      form.hidden = true;
      document.getElementById('formSuccess').hidden = false;
    }).catch(function (error) {
      showFormStatus(error.message || 'There was a problem submitting your application. Please try again or call us.', 'error');
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit application';
    });
  });
})();
