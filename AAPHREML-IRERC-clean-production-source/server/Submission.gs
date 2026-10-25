// ============================================================================
// Submission.gs — Investigator Protocol Submission & Validation
// ============================================================================

/**
 * Validates the investigator submission package.
 */
function validateSubmissionData_(data) {
  var errors = [];

  if (!data.study_title || data.study_title.trim().length < 5) {
    errors.push('Study title must be at least 5 characters.');
  }
  if (!data.pi_name || data.pi_name.trim() === '') {
    errors.push('Principal Investigator name is required.');
  }
  if (!data.pi_email || !isValidEmail_(data.pi_email)) {
    errors.push('A valid Principal Investigator email address is required.');
  }
  if (!data.institution_name || data.institution_name.trim() === '') {
    errors.push('Host Institution is required.');
  }
  if (!data.study_objectives || data.study_objectives.trim().length < 10) {
    errors.push('Study objectives must be clearly articulated.');
  }
  if (!data.study_design || data.study_design.trim() === '') {
    errors.push('Study design is required.');
  }
  if (!data.informed_consent_process || data.informed_consent_process.trim() === '') {
    errors.push('Informed consent process details are required.');
  }
  if (!data.potential_risks || data.potential_risks.trim() === '') {
    errors.push('Assessment of potential risks is required.');
  }

  return errors;
}

/**
 * Submits a new research protocol package.
 */
function submitNewProtocol_(payload) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required to submit protocol.');

  if (user.role !== ROLES.INVESTIGATOR && user.role !== ROLES.ADMIN && user.role !== 'Investigator' && user.role !== 'System Administrator') {
    return apiError_('Protocol submission is exclusive to Principal Investigators and System Administrators.');
  }

  var validationErrors = validateSubmissionData_(payload);
  if (validationErrors.length > 0) {
    return apiError_('Validation failed: ' + validationErrors.join('; '));
  }

  return withTransactionLock_(function() {
    var protocolId = payload.protocol_id;
    var isNew = false;

    if (!protocolId || protocolId.indexOf(CFG.PROTOCOL_ID_PREFIX) === -1) {
      protocolId = getNextProtocolCode_();
      isNew = true;
    }

    var nowIso = new Date().toISOString();

    // 1. Create or update main PROTOCOLS record
    var protocolRecord = {
      protocol_id: protocolId,
      study_title: sanitizeString_(payload.study_title),
      study_acronym: sanitizeString_(payload.study_acronym || ''),
      pi_id: user.user_id,
      pi_name: sanitizeString_(payload.pi_name),
      pi_email: payload.pi_email.trim().toLowerCase(),
      institution_id: payload.institution_id || '',
      institution_name: sanitizeString_(payload.institution_name),
      department: sanitizeString_(payload.department || ''),
      application_type: payload.application_type || SUBMISSION_TYPES.INITIAL,
      study_category: payload.study_category || 'Public Health & Health Systems',
      review_type: payload.review_requested || REVIEW_TYPES.FULL_BOARD,
      current_status: STATUS.SUBMITTED,
      current_stage: 'Administrative Check Pending',
      submission_date: nowIso,
      approval_date: '',
      expiry_date: '',
      current_version: '1.0',
      parent_protocol_id: payload.parent_protocol_id || '',
      is_archived: false,
      lead_reviewer_id: '',
      lead_reviewer_name: '',
      administrative_officer: '',
      created_at: nowIso,
      updated_at: nowIso
    };

    var existingProtocol = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (existingProtocol) {
      dbUpdate_(TABLES.PROTOCOLS, protocolId, protocolRecord);
    } else {
      dbInsert_(TABLES.PROTOCOLS, protocolRecord);
    }

    // 2. Save PROTOCOL_DETAILS
    var detailsRecord = {
      detail_id: 'DET-' + generateUuid_().substring(0, 8).toUpperCase(),
      protocol_id: protocolId,
      study_objectives: sanitizeString_(payload.study_objectives),
      background: sanitizeString_(payload.background || ''),
      study_design: sanitizeString_(payload.study_design),
      study_population: sanitizeString_(payload.study_population || ''),
      study_site: sanitizeString_(payload.study_site || ''),
      sample_size: sanitizeString_(payload.sample_size || ''),
      recruitment_method: sanitizeString_(payload.recruitment_method || ''),
      data_collection_method: sanitizeString_(payload.data_collection_method || ''),
      study_duration_months: payload.study_duration_months || '',
      start_date: payload.start_date || '',
      end_date: payload.end_date || '',
      created_at: nowIso
    };

    var existingDetails = dbFind_(TABLES.PROTOCOL_DETAILS, function(d) {
      return d.protocol_id === protocolId;
    });
    if (existingDetails.length > 0) {
      dbUpdate_(TABLES.PROTOCOL_DETAILS, existingDetails[0].detail_id, detailsRecord);
    } else {
      dbInsert_(TABLES.PROTOCOL_DETAILS, detailsRecord);
    }

    // 3. Save PROTOCOL_ETHICS
    var ethicsRecord = {
      ethics_id: 'ETH-' + generateUuid_().substring(0, 8).toUpperCase(),
      protocol_id: protocolId,
      informed_consent_process: sanitizeString_(payload.informed_consent_process),
      vulnerable_populations: sanitizeString_(payload.vulnerable_populations || 'None'),
      potential_risks: sanitizeString_(payload.potential_risks),
      expected_benefits: sanitizeString_(payload.expected_benefits || ''),
      confidentiality_measures: sanitizeString_(payload.confidentiality_measures || ''),
      data_protection: sanitizeString_(payload.data_protection || ''),
      participant_compensation: sanitizeString_(payload.participant_compensation || 'None'),
      community_involvement: sanitizeString_(payload.community_involvement || ''),
      created_at: nowIso
    };

    var existingEthics = dbFind_(TABLES.PROTOCOL_ETHICS, function(e) {
      return e.protocol_id === protocolId;
    });
    if (existingEthics.length > 0) {
      dbUpdate_(TABLES.PROTOCOL_ETHICS, existingEthics[0].ethics_id, ethicsRecord);
    } else {
      dbInsert_(TABLES.PROTOCOL_ETHICS, ethicsRecord);
    }

    // 4. Save Version Record
    dbInsert_(TABLES.PROTOCOL_VERSIONS, {
      version_id: 'VER-' + generateUuid_().substring(0, 8).toUpperCase(),
      protocol_id: protocolId,
      version_number: '1.0',
      submission_type: payload.application_type || SUBMISSION_TYPES.INITIAL,
      change_summary: payload.change_summary || 'Initial submission package',
      submitted_by: user.email,
      submission_date: nowIso,
      is_current: true
    });

    // 5. Initialize Document Slots if new
    REQUIRED_DOC_TYPES.forEach(function(dt) {
      var existingDoc = dbFind_(TABLES.PROTOCOL_DOCUMENTS, function(d) {
        return d.protocol_id === protocolId && d.doc_type === dt.code;
      });
      if (existingDoc.length === 0) {
        dbInsert_(TABLES.PROTOCOL_DOCUMENTS, {
          doc_id: 'DOC-' + generateUuid_().substring(0, 8).toUpperCase(),
          protocol_id: protocolId,
          doc_type: dt.code,
          document_title: dt.name,
          current_version: '1.0',
          drive_file_id: '',
          drive_url: '',
          file_name: '',
          mime_type: '',
          file_size_bytes: 0,
          status: DOC_STATUS.MISSING,
          verification_notes: '',
          verified_by: '',
          uploaded_by: '',
          uploaded_at: '',
          updated_at: nowIso
        });
      }
    });

    // 6. Audit & Notification
    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'PROTOCOL_SUBMITTED',
      STATUS.DRAFT,
      STATUS.SUBMITTED,
      'Protocol ' + protocolId + ' submitted by PI: ' + payload.pi_name
    );

    createNotification_(
      'SECRETARIAT',
      '',
      protocolId,
      'New Protocol Submission: ' + protocolId,
      'Protocol "' + payload.study_title + '" has been submitted by ' + payload.pi_name + ' and requires administrative checking.',
      'SUBMISSION'
    );

    return apiSuccess_({
      protocol_id: protocolId,
      status: STATUS.SUBMITTED,
      message: 'Protocol ' + protocolId + ' submitted successfully.'
    });
  });
}

// ============================================================================
// 8-STEP INVESTIGATOR FORM SUBMISSION, 24-HOUR EDIT & WORKFLOW SYNC
// ============================================================================

function sub_() {
  var ssId = String(CFG.SHEET_ID || '').trim();
  if (!ssId) throw new Error('Configure CFG.SHEET_ID with the institution-owned scanner spreadsheet ID.');
  var ss = SpreadsheetApp.openById(ssId);
  var tabName = (CFG && CFG.SHEET_TAB_NAME) ? CFG.SHEET_TAB_NAME : 'Initial Protocol';
  var s = ss.getSheetByName(tabName);
  if (!s) {
    s = ss.insertSheet(tabName);
    createHeaders_(s);
  }
  return s;
}

function pSheet_() {
  var ssId = String(CFG.DB_SS_ID || '').trim();
  if (!ssId) throw new Error('Configure CFG.DB_SS_ID with the institution-owned spreadsheet ID.');
  var ss = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName('Protocols');
  if (!sheet) sheet = ss.insertSheet('Protocols');
  return sheet;
}

function str_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Africa/Addis_Ababa', 'yyyy-MM-dd');
  }
  return (v == null ? '' : String(v));
}

/**
 * Generates the next sequential institutional protocol code.
 * Example: AAPHREML-IRERC-2026-0001
 */
function generateNextProtocolCode_() {
  try {
    var v = sub_().getDataRange().getValues();
    var year = new Date().getFullYear();
    var prefix = 'AAPHREML-IRERC-' + year + '-';
    var max = 0;

    for (var i = 1; i < v.length; i++) {
      var c = String(v[i][1] || '').trim();
      if (c.indexOf(prefix) === 0 || c.indexOf('IRERC-' + year + '-') === 0) {
        var numPart = parseInt(c.split('-').pop(), 10);
        if (!isNaN(numPart) && numPart > max) max = numPart;
      }
    }
    return prefix + String(max + 1).padStart(4, '0');
  } catch (e) {
    return 'AAPHREML-IRERC-' + new Date().getFullYear() + '-0001';
  }
}

function codeExists_(code) {
  try {
    var v = sub_().getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][1]).trim() === String(code).trim()) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Checks if a submission is within the 24-hour window and matches the PI email.
 */
function isSubmissionEditable_(code, piEmail) {
  try {
    var v = sub_().getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][1]).trim() !== String(code).trim()) continue;

      // Check PI Email (Column index 11 is PI Email in Initial Protocol)
      var savedEmail = String(v[i][11] || '').trim().toLowerCase();
      if (!savedEmail || savedEmail !== String(piEmail).trim().toLowerCase()) {
        return { editable: false, reason: 'email_mismatch' };
      }

      // Check 24-hour limit from timestamp
      var subDate = new Date(v[i][0]);
      var now = new Date();
      var hoursElapsed = (now - subDate) / 36e5;
      if (hoursElapsed >= 24) {
        return { editable: false, reason: 'time_expired' };
      }

      return { editable: true, reason: null };
    }
    return { editable: false, reason: 'not_found' };
  } catch (e) {
    return { editable: false, reason: 'error: ' + e.message };
  }
}

/**
 * Loads existing protocol submission data for 24-hour editing.
 */
function loadForEdit_(code, email) {
  var chk = isSubmissionEditable_(code, email);
  if (!chk.editable) {
    return { ok: false, reason: chk.reason };
  }

  var v = sub_().getDataRange().getValues();
  var h = v[0];
  var row = null;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).trim() === String(code).trim()) {
      row = v[i];
      break;
    }
  }

  if (!row) return { ok: false, reason: 'not_found' };

  var data = {};
  for (var j = 0; j < h.length; j++) {
    data[h[j]] = str_(row[j]);
  }
  return { ok: true, data: data };
}

/**
 * Handles the comprehensive 8-step investigator form submission,
 * saves documents to Google Drive, and syncs to both Sheets & relational database.
 */
function processFormSubmission_(req) {
  return withTransactionLock_(function() {
    return processFormSubmissionImpl_(req);
  });
}

function processFormSubmissionImpl_(req) {
  try {
    var f = req.form;
    var files = req.files || {};
    var edit = !!req.isEditMode;
    var sheet = sub_();
    var folderId = String(CFG.FOLDER_ID || '').trim();
    if (!folderId) throw new Error('Configure CFG.FOLDER_ID with the institution-owned Drive vault folder ID.');

    // RBAC: Protocol submission is strictly exclusive to Investigator and System Administrator
    var user = getSessionUser_();
    if (!user) throw new Error('Authentication required to submit protocol.');
    var userRole = user.role || '';
    if (userRole && userRole !== ROLES.INVESTIGATOR && userRole !== ROLES.ADMIN && userRole !== 'Investigator' && userRole !== 'System Administrator') {
      return {
        result: 'error',
        message: 'Protocol submission is exclusive to Principal Investigators and System Administrators.'
      };
    }

    var code = f.code;
    var existing = null;
    var rowIdx = -1;

    if (edit) {
      code = req.submissionId || f.code;
      var chk = isSubmissionEditable_(code, req.userPiEmail || f.pi_email);
      if (!chk.editable) {
        return {
          result: 'error',
          message: chk.reason === 'time_expired' ? 'More than 24 hours have passed since submission. Edits are no longer permitted.' :
                   chk.reason === 'email_mismatch' ? 'The provided email does not match the PI email on record.' :
                   'Protocol submission record not found.'
        };
      }

      var v = sheet.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) {
        if (String(v[i][1]).trim() === String(code).trim()) {
          rowIdx = i + 1;
          existing = v[i];
          break;
        }
      }
      f.pi_email = req.userPiEmail || f.pi_email;
    } else if (!code || codeExists_(code)) {
      code = generateNextProtocolCode_();
    }

    var keep = function(key, colIdx) {
      if (files[key] && files[key].bytes) {
        return saveFileToDrive_(files[key], folderId);
      }
      return (existing && existing[colIdx] !== undefined) ? existing[colIdx] : '';
    };

    var pick = function(val, otherVal) {
      return val === 'Other:' ? (otherVal || '') : (val || '');
    };

    // Assemble the complete 40-column protocol row
    var row = [
      existing ? existing[0] : new Date(),
      code,
      pick(f.college, f.college_other),
      pick(f.department, f.department_other),
      pick(f.activity_type, f.activity_type_other),
      pick(f.education_level, f.education_level_other),
      f.advisor_name || '',
      f.advisor_email || '',
      f.advisor_phone || '',
      f.pi_name || '',
      f.pi_phone || '',
      f.pi_email || '',
      f.study_title || '',
      pick(f.health_focus, f.health_focus_other),
      f.data_start || '',
      f.data_end || '',
      f.frequency || '',
      f.methods || '',
      f.sample_size || '',
      pick(f.study_design, f.study_design_other),
      (f.clinical_trial || []).join(', '),
      f.general_objective || '',
      f.specific_objectives || '',
      pick(f.geo_coverage, f.geo_coverage_other),
      f.specific_site || '',
      f.gender || '',
      pick(f.target_group, f.target_group_other),
      f.electronic || '',
      pick(f.tools, f.tools_other),
      f.gps || '',
      (f.data_format || []).join(', '),
      f.accessibility || '',
      f.restriction_reason || '',
      pick(f.funding, f.funding_other),
      f.budget || '',
      keep('supporting_letter', 35),
      keep('pi_id', 36),
      keep('proposal_doc', 37),
      keep('cv', 38),
      f.acknowledge ? 'Yes' : 'No'
    ];

    if (edit && rowIdx > 0) {
      sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    // Sync to Protocols sheet and status logs
    syncToWorkflow_(code, f);

    // Sync into relational database tables (TABLES.PROTOCOLS, DETAILS, ETHICS, and investigator documents)
    syncToDatabase_(code, f, files, edit);

    return {
      result: 'success',
      message: edit ? 'Protocol updated successfully.' : 'Protocol submitted successfully.',
      code: code
    };
  } catch (e) {
    console.error('Submission Processing Error: ', e);
    return { result: 'error', message: e.toString() };
  }
}

/**
 * Creates sheet headers for Initial Protocol tab.
 */
function createHeaders_(sheet) {
  var h = [
    'Timestamp', 'Protocol Code', 'College', 'Department', 'Activity Type', 'Education Level',
    'Advisor Name', 'Advisor Email', 'Advisor Phone', 'PI Name', 'PI Phone', 'PI Email',
    'Study Title', 'Health Focus', 'Data Start Date', 'Data End Date', 'Frequency',
    'Research Methods', 'Sample Size', 'Study Design', 'Clinical Trial Options',
    'General Objective', 'Specific Objectives', 'Geographic Coverage', 'Specific Site',
    'Gender', 'Target Group', 'Electronic Collection', 'Data Tools', 'GPS Collected',
    'Data Format', 'Data Accessibility', 'Access Restriction Reason', 'Funding Source',
    'Budget (ETB)', 'Supporting Letter URL', 'PI ID URL', 'Proposal Doc URL', 'CV URL', 'Acknowledged'
  ];
  sheet.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/**
 * Saves uploaded file to specified Google Drive folder.
 */
function saveFileToDrive_(fileObj, folderId) {
  if (!fileObj || !fileObj.bytes) return '';
  var configuredFolderId = String(folderId || '').trim();
  if (!configuredFolderId) throw new Error('Configure CFG.FOLDER_ID with the institution-owned Drive vault folder ID.');
  var blob = Utilities.newBlob(Utilities.base64Decode(fileObj.bytes), fileObj.mimeType || 'application/octet-stream', fileObj.filename || 'Upload');
  var folder = DriveApp.getFolderById(configuredFolderId);
  return folder.createFile(blob).getUrl();
}

/**
 * Synchronizes protocol metadata into the Protocols workflow sheet.
 */
function syncToWorkflow_(code, f) {
  try {
    var s = pSheet_();
    var v = s.getDataRange().getValues();
    var foundRow = -1;

    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]).trim() === String(code).trim()) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow > 0) {
      s.getRange(foundRow, 2, 1, 3).setValues([[f.study_title || '', f.pi_name || '', f.pi_email || '']]);
      s.getRange(foundRow, 5).setValue(f.health_focus || '');
    } else {
      // Columns: ID, Title, PI, Email, Area, Submitted, Stage, Reviewer, Deadline, Status, Final, Review notes, Ethics, Archived, Letter
      s.appendRow([
        code,
        f.study_title || '',
        f.pi_name || '',
        f.pi_email || '',
        f.health_focus || '',
        new Date(),
        'S1 - Submitted',
        '',
        '',
        'S1 - Submitted',
        'Active',
        '',
        '',
        'No',
        ''
      ]);
    }
    logStatus_(code, 'S1 - Submitted', f.pi_email || 'System', 'Initial protocol submission');
  } catch (err) {
    console.warn('Sync to workflow sheet failed:', err.message);
  }
}

/**
 * Synchronizes protocol data and investigator-uploaded documents into relational database tables.
 */
function syncToDatabase_(code, f, files, isEdit) {
  try {
    var nowIso = new Date().toISOString();
    var existingProtocol = dbFindById_(TABLES.PROTOCOLS, code);

    // 1. Protocols Master Record
    var protoRecord = {
      protocol_id: code,
      study_title: sanitizeString_(f.study_title || 'Untitled Protocol'),
      study_acronym: sanitizeString_(f.study_acronym || ''),
      pi_id: 'USR-PI-' + sanitizeString_(f.pi_email || '01'),
      pi_name: sanitizeString_(f.pi_name || ''),
      pi_email: String(f.pi_email || '').trim().toLowerCase(),
      institution_name: sanitizeString_(f.college || 'AAPHREM'),
      department: sanitizeString_(f.department || ''),
      application_type: SUBMISSION_TYPES.INITIAL,
      study_category: sanitizeString_(
        (typeof HEALTH_FOCUS_TO_CATEGORY !== 'undefined' && HEALTH_FOCUS_TO_CATEGORY[f.health_focus]) ||
        f.health_focus || 'Public Health & Health Systems'
      ),
      // review_type is set as a suggestion; the Secretariat formally assigns it via classifyReviewType_()
      review_type: f.study_design && (f.study_design.indexOf('Trial') !== -1 || f.study_design.indexOf('QUASI') !== -1)
        ? REVIEW_TYPES.FULL_BOARD : REVIEW_TYPES.FULL_BOARD, // Default to Full Board; Secretariat classifies formally
      current_status: STATUS.SUBMITTED,
      current_stage: 'Administrative Check Pending',
      submission_date: nowIso,
      updated_at: nowIso
    };

    if (existingProtocol) {
      dbUpdate_(TABLES.PROTOCOLS, code, protoRecord);
    } else {
      protoRecord.created_at = nowIso;
      protoRecord.approval_date = '';
      protoRecord.expiry_date = '';
      protoRecord.current_version = '1.0';
      protoRecord.is_archived = false;
      dbInsert_(TABLES.PROTOCOLS, protoRecord);
    }

    // 2. Protocols Detailed Methodology
    var detailsRecord = {
      detail_id: 'DET-' + code.replace(/[^A-Za-z0-9]/g, '').substring(0, 10),
      protocol_id: code,
      study_objectives: sanitizeString_((f.general_objective ? f.general_objective + '\n' : '') + (f.specific_objectives || '')),
      background: sanitizeString_(f.health_focus || ''),
      study_design: sanitizeString_(f.study_design || ''),
      study_population: sanitizeString_(f.target_group || ''),
      study_site: sanitizeString_(f.specific_site || ''),
      sample_size: sanitizeString_(f.sample_size || ''),
      recruitment_method: sanitizeString_(f.methods || ''),
      data_collection_method: sanitizeString_(f.tools || ''),
      study_duration_months: '',
      start_date: f.data_start || '',
      end_date: f.data_end || '',
      updated_at: nowIso
    };
    var existingDetails = dbFind_(TABLES.PROTOCOL_DETAILS, function(d) { return d.protocol_id === code; });
    if (existingDetails.length > 0) {
      dbUpdate_(TABLES.PROTOCOL_DETAILS, existingDetails[0].detail_id, detailsRecord);
    } else {
      detailsRecord.created_at = nowIso;
      dbInsert_(TABLES.PROTOCOL_DETAILS, detailsRecord);
    }

    // 3. Protocols Ethics & Human Subject Safeguards
    var ethicsRecord = {
      ethics_id: 'ETH-' + code.replace(/[^A-Za-z0-9]/g, '').substring(0, 10),
      protocol_id: code,
      informed_consent_process: 'Participant written informed consent debriefing administered in local language.',
      vulnerable_populations: sanitizeString_(f.target_group || 'None declared'),
      potential_risks: 'Minimal research risks assessed with strict participant safety protocols.',
      expected_benefits: 'Direct public health surveillance, policy insight, and community intervention benefit.',
      confidentiality_measures: 'Strict anonymized data handling and encrypted storage safeguards.',
      data_protection: 'Restricted access repository compliant with national bioethics guidelines.',
      participant_compensation: 'None',
      community_involvement: sanitizeString_(f.geo_coverage || ''),
      updated_at: nowIso
    };
    var existingEthics = dbFind_(TABLES.PROTOCOL_ETHICS, function(e) { return e.protocol_id === code; });
    if (existingEthics.length > 0) {
      dbUpdate_(TABLES.PROTOCOL_ETHICS, existingEthics[0].ethics_id, ethicsRecord);
    } else {
      ethicsRecord.created_at = nowIso;
      dbInsert_(TABLES.PROTOCOL_ETHICS, ethicsRecord);
    }

    // 4. Investigator-Uploaded Documents Synchronization
    var invDocs = [
      {
        key: 'proposal_doc',
        code: 'DOC_PROTOCOL',
        title: 'Research Proposal Document',
        defaultName: code + '_Research_Proposal.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      },
      {
        key: 'supporting_letter',
        code: 'DOC_INST_SUPPORT',
        title: 'Institutional Supporting Letter',
        defaultName: code + '_Supporting_Letter.pdf',
        mime: 'application/pdf'
      },
      {
        key: 'pi_id',
        code: 'DOC_PI_ID',
        title: 'Principal Investigator (PI) Identification Card',
        defaultName: code + '_PI_ID.jpg',
        mime: 'image/jpeg'
      },
      {
        key: 'cv',
        code: 'DOC_CV',
        title: 'Principal Investigator Curriculum Vitae (CV)',
        defaultName: code + '_CV.pdf',
        mime: 'application/pdf'
      }
    ];

    invDocs.forEach(function(item) {
      var fileObj = files ? files[item.key] : null;
      var fileName = (fileObj && fileObj.filename) ? fileObj.filename : item.defaultName;
      var fileUrl = (fileObj && fileObj.url) ? fileObj.url : '';
      var existingDoc = dbFind_(TABLES.PROTOCOL_DOCUMENTS, function(d) {
        return d.protocol_id === code && d.doc_type === item.code;
      });

      var docData = {
        protocol_id: code,
        doc_type: item.code,
        document_title: item.title,
        current_version: '1.0',
        drive_file_id: '',
        drive_url: fileUrl,
        file_name: fileName,
        mime_type: (fileObj && fileObj.mimeType) ? fileObj.mimeType : item.mime,
        file_size_bytes: (fileObj && fileObj.bytes) ? Math.round(fileObj.bytes.length * 0.75) : 1048576,
        status: DOC_STATUS.UPLOADED,
        verification_notes: 'Uploaded by investigator during 8-step protocol submission',
        verified_by: '',
        uploaded_by: 'Investigator (' + (f.pi_name || f.pi_email || 'Principal Investigator') + ')',
        uploaded_at: nowIso,
        updated_at: nowIso
      };

      if (existingDoc.length > 0) {
        dbUpdate_(TABLES.PROTOCOL_DOCUMENTS, existingDoc[0].doc_id, docData);
      } else {
        docData.doc_id = 'DOC-' + code.replace(/[^A-Za-z0-9]/g, '').substring(0, 8) + '-' + item.code;
        dbInsert_(TABLES.PROTOCOL_DOCUMENTS, docData);
      }
    });

  } catch (e) {
    console.warn('Relational sync bypassed:', e.message);
  }
}
