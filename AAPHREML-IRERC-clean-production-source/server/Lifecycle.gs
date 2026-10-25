// ============================================================================
// Lifecycle.gs — Amendments, Continuing Reviews & Protocol Termination
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Protocol Amendments Subsystem
// ----------------------------------------------------------------------------

/**
 * Step 1 & 2: Submits a Protocol Amendment request and notifies IRERC Chairperson.
 * Guarantees that original approved protocol is NEVER overwritten.
 */
function submitProtocolAmendment_(payload) {
  var user = requireAuthorizedRole_([ROLES.INVESTIGATOR, ROLES.ADMIN]);

  if (!payload.protocol_id || !payload.amendment_title || !payload.rationale) {
    return apiError_('Protocol ID, Amendment Title, and Rationale are required.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, payload.protocol_id);
    if (!p) return apiError_('Protocol not found: ' + payload.protocol_id);

    // Existing amendments count to assign sequential number (e.g. AMD-01)
    var existingAmds = dbFind_(TABLES.AMENDMENTS, function(a) {
      return a.protocol_id === payload.protocol_id;
    });
    var amdNumber = 'AMD-' + ('0' + (existingAmds.length + 1)).slice(-2);
    var nowIso = new Date().toISOString();
    var amendmentId = 'AMDREC-' + generateUuid_().substring(0, 8).toUpperCase();

    var amdRecord = {
      amendment_id: amendmentId,
      protocol_id: payload.protocol_id,
      amendment_number: amdNumber,
      submission_date: nowIso,
      amendment_title: sanitizeString_(payload.amendment_title),
      amendment_type: payload.amendment_type || 'Minor Amendment',
      review_path: 'Pending Classification',
      rationale: sanitizeString_(payload.rationale),
      summary_of_changes: sanitizeString_(payload.summary_of_changes || ''),
      chair_notified_date: nowIso,
      status: 'Submitted',
      decision_id: '',
      decision_date: '',
      submitted_by: user.email,
      created_at: nowIso
    };

    dbInsert_(TABLES.AMENDMENTS, amdRecord);

    // Update main protocol status to AMENDMENT_PENDING
    dbUpdate_(TABLES.PROTOCOLS, payload.protocol_id, {
      current_status: STATUS.AMENDMENT_PENDING,
      current_stage: 'Protocol Amendment ' + amdNumber + ' Pending Review',
      updated_at: nowIso
    });

    // Step 2: Notify Chairperson
    createNotification_(
      'CHAIR',
      '',
      payload.protocol_id,
      'New Protocol Amendment Submitted: ' + payload.protocol_id + ' (' + amdNumber + ')',
      'An amendment request ("' + payload.amendment_title + '") has been submitted for approved protocol ' + payload.protocol_id + '. Please review for Expedited vs Full Board classification.',
      'AMENDMENT'
    );

    logAuditEvent_(
      payload.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'AMENDMENT_SUBMITTED',
      p.current_status,
      STATUS.AMENDMENT_PENDING,
      'Submitted amendment ' + amdNumber + ': ' + payload.amendment_title
    );

    return apiSuccess_(amdRecord, 'Amendment ' + amdNumber + ' successfully submitted and Chairperson notified.');
  });
}

/**
 * Step 3: Classify amendment review path (Expedited vs Full Board Review).
 */
function classifyAmendmentReviewPath_(amendmentId, reviewPath, justification) {
  var user = requireAuthorizedRole_([ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.SECRETARIAT, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var amd = dbFindById_(TABLES.AMENDMENTS, amendmentId);
    if (!amd) return apiError_('Amendment not found.');

    var updated = dbUpdate_(TABLES.AMENDMENTS, amendmentId, {
      review_path: reviewPath, // 'Expedited Review' or 'Full Board Review'
      status: 'Under ' + reviewPath
    });

    logAuditEvent_(
      amd.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'AMENDMENT_CLASSIFIED',
      '',
      reviewPath,
      'Amendment ' + amd.amendment_number + ' classified as ' + reviewPath + ' by ' + user.full_name + '. Notes: ' + (justification || '')
    );

    return apiSuccess_(updated, 'Amendment classified for ' + reviewPath + '.');
  });
}

// ----------------------------------------------------------------------------
// 2. Continuing Review Subsystem
// ----------------------------------------------------------------------------

/**
 * Submits an annual or periodic Continuing Review progress report.
 */
function submitContinuingReview_(payload) {
  var user = requireAuthorizedRole_([ROLES.INVESTIGATOR, ROLES.ADMIN]);

  if (!payload.protocol_id || !payload.progress_summary) {
    return apiError_('Protocol ID and Progress Summary are required.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, payload.protocol_id);
    if (!p) return apiError_('Protocol not found: ' + payload.protocol_id);

    var nowIso = new Date().toISOString();
    var contId = 'CR-' + generateUuid_().substring(0, 8).toUpperCase();

    var crRecord = {
      cont_review_id: contId,
      protocol_id: payload.protocol_id,
      submission_date: nowIso,
      current_study_status: payload.current_study_status || 'Active - Enrolling',
      target_sample_size: payload.target_sample_size || '',
      enrolled_participants: payload.enrolled_participants || 0,
      progress_summary: sanitizeString_(payload.progress_summary),
      adverse_events_count: payload.adverse_events_count || 0,
      adverse_events_summary: sanitizeString_(payload.adverse_events_summary || 'None reported'),
      protocol_deviations_summary: sanitizeString_(payload.protocol_deviations_summary || 'None reported'),
      next_review_date: '',
      decision_id: '',
      status: 'Submitted for IRERC Review',
      submitted_by: user.email,
      created_at: nowIso
    };

    dbInsert_(TABLES.CONTINUING_REVIEWS, crRecord);

    dbUpdate_(TABLES.PROTOCOLS, payload.protocol_id, {
      current_status: STATUS.CONTINUING_REVIEW_PENDING,
      current_stage: 'Continuing Review Under Evaluation',
      updated_at: nowIso
    });

    createNotification_(
      'SECRETARIAT',
      '',
      payload.protocol_id,
      'Continuing Review Submitted: ' + payload.protocol_id,
      'Annual/periodic continuing review report submitted for protocol ' + payload.protocol_id + ' by ' + p.pi_name + '.',
      'CONTINUING_REVIEW'
    );

    logAuditEvent_(
      payload.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'CONTINUING_REVIEW_SUBMITTED',
      p.current_status,
      STATUS.CONTINUING_REVIEW_PENDING,
      'Continuing review report submitted: ' + payload.current_study_status + ' (' + payload.enrolled_participants + ' enrolled)'
    );

    return apiSuccess_(crRecord, 'Continuing review submission recorded.');
  });
}

// ----------------------------------------------------------------------------
// 3. Protocol Termination & Closeout Subsystem
// ----------------------------------------------------------------------------

/**
 * Submits study termination or study completion final report.
 */
function submitProtocolTermination_(payload) {
  var user = requireAuthorizedRole_([ROLES.INVESTIGATOR, ROLES.ADMIN]);

  if (!payload.protocol_id || !payload.reason_for_termination) {
    return apiError_('Protocol ID and Reason for Termination/Completion are required.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, payload.protocol_id);
    if (!p) return apiError_('Protocol not found: ' + payload.protocol_id);

    var nowIso = new Date().toISOString();
    var termId = 'TERM-' + generateUuid_().substring(0, 8).toUpperCase();

    var termRecord = {
      termination_id: termId,
      protocol_id: payload.protocol_id,
      submission_date: nowIso,
      submitted_by: user.email,
      reason_for_termination: sanitizeString_(payload.reason_for_termination),
      study_completion_status: payload.study_completion_status || 'Completed per Protocol',
      total_participants_enrolled: payload.total_participants_enrolled || 0,
      summary_of_findings: sanitizeString_(payload.summary_of_findings || ''),
      final_report_doc_id: payload.final_report_doc_id || '',
      decision_id: '',
      archival_date: nowIso,
      status: 'Terminated / Closed',
      created_at: nowIso
    };

    dbInsert_(TABLES.TERMINATIONS, termRecord);

    // Transition protocol to TERMINATED and archive
    dbUpdate_(TABLES.PROTOCOLS, payload.protocol_id, {
      current_status: STATUS.TERMINATED,
      current_stage: 'Protocol Terminated & Archived',
      is_archived: true,
      updated_at: nowIso
    });

    logAuditEvent_(
      payload.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'PROTOCOL_TERMINATED',
      p.current_status,
      STATUS.TERMINATED,
      'Protocol terminated/closed: ' + payload.study_completion_status + ' (' + payload.reason_for_termination + ')'
    );

    createNotification_(
      'SECRETARIAT',
      '',
      payload.protocol_id,
      'Protocol Terminated: ' + payload.protocol_id,
      'Protocol ' + payload.protocol_id + ' has been concluded and archived.',
      'TERMINATION'
    );

    return apiSuccess_(termRecord, 'Protocol successfully terminated and archived.');
  });
}
