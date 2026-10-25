// ============================================================================
// DataCollection.gs — Post-Clearance Data Collection Monitoring
// AAPHREML-IRERC · Addis Ababa City Administration Health Bureau
//
// Lifecycle after "Approved":
//   Approved
//     → Data Collection Active       (PI starts collection)
//     → [progress reports on-demand, alert if >60 days silent]
//     → Data Collection Complete      (PI declares end)
//     → Closeout Submitted            (PI uploads final report + dataset)
//     → Closeout Under Review         (Secretariat reviews)
//     → Study Archived                (full record locked)
//
//   Side-branches:
//     → Data Collection Suspended     (AACAHB suspends)
//     → Clearance Expired             (auto-flagged at expiry_date)
// ============================================================================

var DC_REPORT_INTERVAL_DAYS = 60; // Alert threshold: flag if no report in this many days

// ----------------------------------------------------------------------------
// 1. START DATA COLLECTION
// Called by PI after receiving clearance letter. Records actual start date
// and transitions protocol to DATA_COLLECTION_ACTIVE.
// ----------------------------------------------------------------------------
function startDataCollection_(protocolId, actualStartDate, confirmationStatement) {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  if (user.role !== ROLES.INVESTIGATOR && user.role !== ROLES.ADMIN) {
    return apiError_('Only the Principal Investigator may start data collection.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    // Gate: must be in Approved / Decision Communicated state
    var allowedStates = ['Approved', STATUS.COMMUNICATED, STATUS.FINAL_DECISION];
    if (allowedStates.indexOf(p.current_status) === -1) {
      return apiError_('Data collection can only begin after ethical clearance has been granted. Current status: ' + p.current_status);
    }

    // Gate: check clearance expiry
    if (p.expiry_date && new Date(p.expiry_date) < new Date()) {
      return apiError_('Ethical clearance has expired on ' + p.expiry_date + '. Please apply for a renewal before beginning data collection.');
    }

    if (!confirmationStatement) {
      return apiError_('PI must confirm they will conduct data collection strictly in accordance with the approved protocol.');
    }

    var nowIso = new Date().toISOString();
    var startDate = actualStartDate || nowIso.substring(0, 10);

    dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      current_status: STATUS.DATA_COLLECTION_ACTIVE,
      current_stage: 'Data Collection Active — Started ' + startDate,
      data_collection_start_date: startDate,
      last_report_date: nowIso,      // initialise so 60-day timer starts from today
      updated_at: nowIso
    });

    // Notify Secretariat
    createNotification_('SECRETARIAT', '', protocolId,
      'Data Collection Started: ' + protocolId,
      p.pi_name + ' has commenced data collection for protocol ' + protocolId +
      ' at ' + (p.study_site || p.institution_name) + '. Start date: ' + startDate + '.',
      'DATA_COLLECTION');

    logAuditEvent_(protocolId, user.user_id, user.full_name, user.role,
      'DATA_COLLECTION_STARTED', p.current_status, STATUS.DATA_COLLECTION_ACTIVE,
      'PI confirmed data collection start. Sites: ' + (p.study_site || p.institution_name) +
      '. PI statement: ' + confirmationStatement);

    return apiSuccess_({ protocolId: protocolId, startDate: startDate },
      'Data collection commenced. Progress reports are required at least every ' +
      DC_REPORT_INTERVAL_DAYS + ' days or whenever a significant event occurs.');
  });
}

// ----------------------------------------------------------------------------
// 2. SUBMIT PROGRESS REPORT (on-demand by PI)
// ----------------------------------------------------------------------------
function submitProgressReport_(payload) {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  var required = ['protocol_id', 'reporting_period_start', 'reporting_period_end',
                  'participants_enrolled_this_period', 'participants_enrolled_total',
                  'data_collection_status', 'sites_visited'];
  for (var i = 0; i < required.length; i++) {
    if (!payload[required[i]] && payload[required[i]] !== 0) {
      return apiError_('Missing required field: ' + required[i]);
    }
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, payload.protocol_id);
    if (!p) return apiError_('Protocol not found: ' + payload.protocol_id);

    var activeStates = [STATUS.DATA_COLLECTION_ACTIVE, STATUS.DATA_COLLECTION_SUSPENDED];
    if (activeStates.indexOf(p.current_status) === -1) {
      return apiError_('Progress reports can only be submitted while data collection is active.');
    }

    var nowIso = new Date().toISOString();
    var existingReports = dbFind_(TABLES.DATA_COLLECTION_REPORTS, function(r) {
      return r.protocol_id === payload.protocol_id;
    });
    var reportNum = 'RPT-' + ('0' + (existingReports.length + 1)).slice(-2);
    var reportId  = 'DCR-' + generateUuid_().substring(0, 8).toUpperCase();

    var record = {
      report_id:                       reportId,
      protocol_id:                     payload.protocol_id,
      report_number:                   reportNum,
      report_type:                     payload.report_type || 'Progress Report',
      report_date:                     nowIso,
      reporting_period_start:          payload.reporting_period_start,
      reporting_period_end:            payload.reporting_period_end,
      sites_visited:                   sanitizeString_(payload.sites_visited),
      sites_not_yet_visited:           sanitizeString_(payload.sites_not_yet_visited || 'None'),
      participants_enrolled_this_period: Number(payload.participants_enrolled_this_period) || 0,
      participants_enrolled_total:     Number(payload.participants_enrolled_total) || 0,
      participants_target:             Number(p.sample_size) || 0,
      data_collection_status:          payload.data_collection_status, // On Track / Behind Schedule / Deviation Noted
      protocol_deviations:             sanitizeString_(payload.protocol_deviations || 'None'),
      adverse_events_count:            Number(payload.adverse_events_count) || 0,
      adverse_events_description:      sanitizeString_(payload.adverse_events_description || 'None'),
      challenges_noted:                sanitizeString_(payload.challenges_noted || ''),
      submitted_by:                    user.email,
      aacahb_review_status:            'Pending Review',
      aacahb_comments:                 '',
      reviewed_by:                     '',
      reviewed_at:                     '',
      created_at:                      nowIso
    };

    dbInsert_(TABLES.DATA_COLLECTION_REPORTS, record);

    // Reset 60-day timer
    dbUpdate_(TABLES.PROTOCOLS, payload.protocol_id, {
      last_report_date: nowIso,
      updated_at: nowIso
    });

    // Notify Secretariat
    createNotification_('SECRETARIAT', '', payload.protocol_id,
      'Progress Report Submitted: ' + payload.protocol_id + ' (' + reportNum + ')',
      p.pi_name + ' submitted ' + reportNum + ' for protocol ' + payload.protocol_id +
      '. Status: ' + payload.data_collection_status +
      '. Total enrolled: ' + payload.participants_enrolled_total + '.',
      'DATA_COLLECTION');

    // If adverse events or deviations — escalate to Chair too
    if (Number(payload.adverse_events_count) > 0 || payload.protocol_deviations && payload.protocol_deviations.trim().toLowerCase() !== 'none') {
      createNotification_('CHAIR', '', payload.protocol_id,
        'ALERT — Deviation/Adverse Event Reported: ' + payload.protocol_id,
        reportNum + ' for protocol ' + payload.protocol_id + ' reports ' +
        payload.adverse_events_count + ' adverse event(s) and/or protocol deviation(s). Immediate review recommended.',
        'ALERT');
    }

    logAuditEvent_(payload.protocol_id, user.user_id, user.full_name, user.role,
      'PROGRESS_REPORT_SUBMITTED', p.current_status, p.current_status,
      reportNum + ' submitted. Enrolled: ' + payload.participants_enrolled_total +
      '. Status: ' + payload.data_collection_status);

    return apiSuccess_(record, reportNum + ' submitted successfully. AACAHB will review and respond.');
  });
}

// ----------------------------------------------------------------------------
// 3. REVIEW PROGRESS REPORT (Secretary / Chair / Admin)
// ----------------------------------------------------------------------------
function reviewProgressReport_(reportId, reviewStatus, comments, suspendProtocol) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var report = dbFindById_(TABLES.DATA_COLLECTION_REPORTS, reportId);
    if (!report) return apiError_('Report not found: ' + reportId);

    var nowIso = new Date().toISOString();

    dbUpdate_(TABLES.DATA_COLLECTION_REPORTS, reportId, {
      aacahb_review_status: reviewStatus,  // 'Reviewed' | 'Flagged' | 'Suspended'
      aacahb_comments:      sanitizeString_(comments || ''),
      reviewed_by:          user.full_name,
      reviewed_at:          nowIso
    });

    var p = dbFindById_(TABLES.PROTOCOLS, report.protocol_id);

    // Optional: suspend data collection
    if (suspendProtocol) {
      dbUpdate_(TABLES.PROTOCOLS, report.protocol_id, {
        current_status: STATUS.DATA_COLLECTION_SUSPENDED,
        current_stage:  'Data Collection Suspended by AACAHB',
        updated_at:     nowIso
      });
      createNotification_(p.pi_id || '', p.pi_email, report.protocol_id,
        'Data Collection Suspended: ' + report.protocol_id,
        'AACAHB has suspended data collection for protocol ' + report.protocol_id +
        '. Reason: ' + (comments || 'See report review comments.') +
        ' Please contact the Secretariat immediately.',
        'SUSPENSION');
      logAuditEvent_(report.protocol_id, user.user_id, user.full_name, user.role,
        'DATA_COLLECTION_SUSPENDED', STATUS.DATA_COLLECTION_ACTIVE, STATUS.DATA_COLLECTION_SUSPENDED,
        'Suspended via ' + report.report_number + ' review. Reason: ' + comments);
    } else {
      // Notify PI of review outcome
      createNotification_(p.pi_id || '', p.pi_email, report.protocol_id,
        'Progress Report Reviewed: ' + report.protocol_id + ' (' + report.report_number + ')',
        'AACAHB has reviewed your ' + report.report_number + '. Status: ' + reviewStatus +
        (comments ? '. Comments: ' + comments : '.'),
        'DATA_COLLECTION');
      logAuditEvent_(report.protocol_id, user.user_id, user.full_name, user.role,
        'PROGRESS_REPORT_REVIEWED', '', '',
        report.report_number + ' reviewed as "' + reviewStatus + '" by ' + user.full_name);
    }

    return apiSuccess_({ reportId: reportId, reviewStatus: reviewStatus },
      'Progress report ' + report.report_number + ' marked as ' + reviewStatus + '.');
  });
}

// ----------------------------------------------------------------------------
// 4. DECLARE DATA COLLECTION COMPLETE (PI)
// ----------------------------------------------------------------------------
function declareDataCollectionComplete_(protocolId, completionDate, completionNotes) {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    if (p.current_status !== STATUS.DATA_COLLECTION_ACTIVE) {
      return apiError_('Protocol must be in "Data Collection Active" status to declare completion.');
    }

    var nowIso = new Date().toISOString();
    dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      current_status:              STATUS.DATA_COLLECTION_COMPLETE,
      current_stage:               'Data Collection Complete — Awaiting Closeout Submission',
      data_collection_end_date:    completionDate || nowIso.substring(0, 10),
      updated_at:                  nowIso
    });

    createNotification_('SECRETARIAT', '', protocolId,
      'Data Collection Declared Complete: ' + protocolId,
      p.pi_name + ' has declared data collection complete for protocol ' + protocolId +
      '. Awaiting closeout report and research outputs.',
      'DATA_COLLECTION');

    logAuditEvent_(protocolId, user.user_id, user.full_name, user.role,
      'DATA_COLLECTION_COMPLETE', STATUS.DATA_COLLECTION_ACTIVE, STATUS.DATA_COLLECTION_COMPLETE,
      'PI declared data collection complete on ' + (completionDate || nowIso.substring(0, 10)) +
      '. Notes: ' + (completionNotes || ''));

    return apiSuccess_({ protocolId: protocolId },
      'Data collection marked as complete. Please now submit your Closeout Report and research outputs.');
  });
}

// ----------------------------------------------------------------------------
// 5. SUBMIT CLOSEOUT REPORT (PI — Final step)
// ----------------------------------------------------------------------------
function submitStudyCloseout_(payload) {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  var required = ['protocol_id', 'total_participants_enrolled', 'study_completion_status',
                  'summary_of_findings', 'ethical_compliance_statement'];
  for (var i = 0; i < required.length; i++) {
    if (!payload[required[i]] && payload[required[i]] !== 0) {
      return apiError_('Missing required field: ' + required[i]);
    }
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, payload.protocol_id);
    if (!p) return apiError_('Protocol not found: ' + payload.protocol_id);

    var allowedStates = [STATUS.DATA_COLLECTION_COMPLETE, STATUS.DATA_COLLECTION_ACTIVE];
    if (allowedStates.indexOf(p.current_status) === -1) {
      return apiError_('Closeout can only be submitted after data collection is complete or active.');
    }

    var nowIso  = new Date().toISOString();
    var closeId = 'CLO-' + generateUuid_().substring(0, 8).toUpperCase();

    var record = {
      closeout_id:                  closeId,
      protocol_id:                  payload.protocol_id,
      submission_date:              nowIso,
      submitted_by:                 user.email,
      actual_start_date:            p.data_collection_start_date || '',
      actual_end_date:              p.data_collection_end_date || nowIso.substring(0, 10),
      total_participants_enrolled:  Number(payload.total_participants_enrolled) || 0,
      study_completion_status:      payload.study_completion_status, // Completed / Partially / Terminated Early
      summary_of_findings:          sanitizeString_(payload.summary_of_findings),
      deviation_from_protocol:      sanitizeString_(payload.deviation_from_protocol || 'None'),
      research_findings_doc_id:     payload.research_findings_doc_id || payload.final_report_doc_id || '',
      final_report_doc_id:           payload.research_findings_doc_id || payload.final_report_doc_id || '',
      dataset_doc_id:                payload.dataset_doc_id || '',
      ethical_compliance_statement: sanitizeString_(payload.ethical_compliance_statement),
      aacahb_acceptance_status:     'Pending Review',
      accepted_by:                  '',
      acceptance_date:              '',
      archival_date:                '',
      created_at:                   nowIso
    };

    dbInsert_(TABLES.STUDY_CLOSEOUTS, record);

    dbUpdate_(TABLES.PROTOCOLS, payload.protocol_id, {
      current_status: STATUS.CLOSEOUT_SUBMITTED,
      current_stage:  'Closeout Report Submitted — Awaiting AACAHB Review',
      updated_at:     nowIso
    });

    createNotification_('SECRETARIAT', '', payload.protocol_id,
      'Closeout Report Submitted: ' + payload.protocol_id,
      p.pi_name + ' has submitted the final closeout report for protocol ' + payload.protocol_id +
      '. Research outputs are ready for AACAHB review and archival.',
      'CLOSEOUT');
    createNotification_('CHAIR', '', payload.protocol_id,
      'Study Closeout Ready for Review: ' + payload.protocol_id,
      'Protocol ' + payload.protocol_id + ' — final report and dataset submitted by ' + p.pi_name + '.',
      'CLOSEOUT');

    logAuditEvent_(payload.protocol_id, user.user_id, user.full_name, user.role,
      'CLOSEOUT_SUBMITTED', p.current_status, STATUS.CLOSEOUT_SUBMITTED,
      'Closeout submitted. Completion: ' + payload.study_completion_status +
      '. Enrolled: ' + payload.total_participants_enrolled +
      '. Research Findings Archive: ' + (payload.research_findings_doc_id || payload.final_report_doc_id ? 'Attached (ZIP)' : 'Pending'));

    return apiSuccess_(record,
      'Closeout report submitted successfully (' + closeId + '). AACAHB will review and archive the complete study record.');
  });
}

// ----------------------------------------------------------------------------
// 6. ACCEPT CLOSEOUT & ARCHIVE (Secretary / Chair / Admin)
// ----------------------------------------------------------------------------
function acceptStudyCloseout_(closeoutId, acceptanceNotes, returnForRevision) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var co = dbFindById_(TABLES.STUDY_CLOSEOUTS, closeoutId);
    if (!co) return apiError_('Closeout record not found: ' + closeoutId);

    var nowIso = new Date().toISOString();
    var p = dbFindById_(TABLES.PROTOCOLS, co.protocol_id);

    if (returnForRevision) {
      dbUpdate_(TABLES.STUDY_CLOSEOUTS, closeoutId, {
        aacahb_acceptance_status: 'Returned for Revision',
        accepted_by:  user.full_name,
        acceptance_date: nowIso
      });
      dbUpdate_(TABLES.PROTOCOLS, co.protocol_id, {
        current_status: STATUS.DATA_COLLECTION_COMPLETE,
        current_stage:  'Closeout Returned — Revision Required',
        updated_at:     nowIso
      });
      createNotification_(p.pi_id || '', p.pi_email, co.protocol_id,
        'Closeout Returned for Revision: ' + co.protocol_id,
        'AACAHB has returned your closeout report for revision. ' +
        (acceptanceNotes ? 'Comments: ' + acceptanceNotes : 'Please check the portal for details.'),
        'CLOSEOUT');
      logAuditEvent_(co.protocol_id, user.user_id, user.full_name, user.role,
        'CLOSEOUT_RETURNED', STATUS.CLOSEOUT_SUBMITTED, STATUS.DATA_COLLECTION_COMPLETE,
        'Closeout returned for revision by ' + user.full_name + '. Notes: ' + acceptanceNotes);
      return apiSuccess_({ closeoutId: closeoutId }, 'Closeout returned to PI for revision.');
    }

    // Accept and archive
    dbUpdate_(TABLES.STUDY_CLOSEOUTS, closeoutId, {
      aacahb_acceptance_status: 'Accepted',
      accepted_by:              user.full_name,
      acceptance_date:          nowIso,
      archival_date:            nowIso
    });

    dbUpdate_(TABLES.PROTOCOLS, co.protocol_id, {
      current_status: STATUS.STUDY_ARCHIVED,
      current_stage:  'Study Archived — Complete Record Locked',
      is_archived:    true,
      archival_date:  nowIso,
      updated_at:     nowIso
    });

    createNotification_(p.pi_id || '', p.pi_email, co.protocol_id,
      'Study Archived: ' + co.protocol_id,
      'Congratulations — the complete research record for protocol ' + co.protocol_id +
      ' has been accepted and archived by AACAHB. ' +
      (acceptanceNotes ? 'Notes: ' + acceptanceNotes : ''),
      'CLOSEOUT');

    logAuditEvent_(co.protocol_id, user.user_id, user.full_name, user.role,
      'STUDY_ARCHIVED', STATUS.CLOSEOUT_SUBMITTED, STATUS.STUDY_ARCHIVED,
      'Study fully archived by ' + user.full_name + '. All outputs verified and locked.');

    return apiSuccess_({ closeoutId: closeoutId, protocolId: co.protocol_id },
      'Protocol ' + co.protocol_id + ' has been accepted and permanently archived.');
  });
}

// ----------------------------------------------------------------------------
// 7. CHECK & FLAG OVERDUE REPORTS (run as a scheduled trigger or on dashboard load)
// Flags protocols where no progress report has been received in DC_REPORT_INTERVAL_DAYS days.
// ----------------------------------------------------------------------------
function checkOverdueProgressReports_() {
  try {
    var now = new Date();
    var threshold = new Date(now.getTime() - DC_REPORT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

    var activeProtocols = dbFind_(TABLES.PROTOCOLS, function(p) {
      return p.current_status === STATUS.DATA_COLLECTION_ACTIVE;
    });

    var flagged = [];
    activeProtocols.forEach(function(p) {
      var lastReport = p.last_report_date ? new Date(p.last_report_date) : null;
      if (!lastReport || lastReport < threshold) {
        var daysSince = lastReport
          ? Math.floor((now - lastReport) / (1000 * 60 * 60 * 24))
          : 'unknown';
        flagged.push({
          protocol_id:    p.protocol_id,
          pi_name:        p.pi_name,
          pi_email:       p.pi_email,
          study_title:    p.study_title,
          days_overdue:   daysSince,
          last_report:    p.last_report_date || 'No report submitted'
        });
        // Notify Secretariat (deduplicated by checking recent notifications could be added)
        createNotification_('SECRETARIAT', '', p.protocol_id,
          'Overdue Progress Report: ' + p.protocol_id,
          'Protocol ' + p.protocol_id + ' (' + p.pi_name + ') has not submitted a progress report in ' +
          daysSince + ' days (threshold: ' + DC_REPORT_INTERVAL_DAYS + ' days). Follow-up required.',
          'OVERDUE');
      }
    });

    return apiSuccess_({ flaggedCount: flagged.length, flagged: flagged },
      flagged.length + ' protocol(s) flagged as overdue for progress reports.');
  } catch (e) {
    return apiError_('Could not check overdue reports: ' + e.message);
  }
}

// ----------------------------------------------------------------------------
// 8. CHECK & FLAG EXPIRED CLEARANCES
// ----------------------------------------------------------------------------
function checkExpiredClearances_() {
  try {
    var now = new Date();
    var active = dbFind_(TABLES.PROTOCOLS, function(p) {
      return p.current_status === STATUS.DATA_COLLECTION_ACTIVE ||
             p.current_status === STATUS.COMMUNICATED ||
             p.current_status === STATUS.FINAL_DECISION;
    });

    var expired = [];
    active.forEach(function(p) {
      if (p.expiry_date && new Date(p.expiry_date) < now) {
        dbUpdate_(TABLES.PROTOCOLS, p.protocol_id, {
          current_status: STATUS.CLEARANCE_EXPIRED,
          current_stage:  'Clearance Expired — Renewal Required',
          updated_at:     now.toISOString()
        });
        createNotification_(p.pi_id || '', p.pi_email, p.protocol_id,
          'Clearance Expired: ' + p.protocol_id,
          'Your ethical clearance for protocol ' + p.protocol_id +
          ' expired on ' + p.expiry_date +
          '. You must not continue data collection until a renewal is granted. Please apply for a Continuing Review immediately.',
          'EXPIRY');
        createNotification_('SECRETARIAT', '', p.protocol_id,
          'Clearance Expired: ' + p.protocol_id,
          'Protocol ' + p.protocol_id + ' (' + p.pi_name + ') ethical clearance expired on ' +
          p.expiry_date + '. Protocol auto-flagged.',
          'EXPIRY');
        expired.push({ protocol_id: p.protocol_id, expiry_date: p.expiry_date });
        logAuditEvent_(p.protocol_id, 'SYSTEM', 'Automated System Check', 'System',
          'CLEARANCE_EXPIRED', p.current_status, STATUS.CLEARANCE_EXPIRED,
          'Clearance auto-expired. Expiry date: ' + p.expiry_date);
      }
    });

    return apiSuccess_({ expiredCount: expired.length, expired: expired },
      expired.length + ' clearance(s) flagged as expired.');
  } catch (e) {
    return apiError_('Could not check expired clearances: ' + e.message);
  }
}

// ----------------------------------------------------------------------------
// 9. GET MONITORING DATA (for AACAHB dashboard)
// ----------------------------------------------------------------------------
function getMonitoringDashboard_() {
  requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  var now = new Date();
  var threshold = new Date(now.getTime() - DC_REPORT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  var expiryWarning = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  var allProtocols = dbGetAll_(TABLES.PROTOCOLS);
  var allReports   = dbGetAll_(TABLES.DATA_COLLECTION_REPORTS);
  var allCloseouts = dbGetAll_(TABLES.STUDY_CLOSEOUTS);

  var active = allProtocols.filter(function(p) {
    return p.current_status === STATUS.DATA_COLLECTION_ACTIVE;
  });
  var suspended = allProtocols.filter(function(p) {
    return p.current_status === STATUS.DATA_COLLECTION_SUSPENDED;
  });
  var complete = allProtocols.filter(function(p) {
    return p.current_status === STATUS.DATA_COLLECTION_COMPLETE;
  });
  var closeoutPending = allProtocols.filter(function(p) {
    return p.current_status === STATUS.CLOSEOUT_SUBMITTED ||
           p.current_status === STATUS.CLOSEOUT_UNDER_REVIEW;
  });
  var archived = allProtocols.filter(function(p) {
    return p.current_status === STATUS.STUDY_ARCHIVED;
  });
  var expired = allProtocols.filter(function(p) {
    return p.current_status === STATUS.CLEARANCE_EXPIRED;
  });

  // Overdue: active but no report in threshold
  var overdue = active.filter(function(p) {
    var lr = p.last_report_date ? new Date(p.last_report_date) : null;
    return !lr || lr < threshold;
  });

  // Expiring soon
  var expiringSoon = allProtocols.filter(function(p) {
    return p.expiry_date &&
           new Date(p.expiry_date) > now &&
           new Date(p.expiry_date) < expiryWarning &&
           p.current_status === STATUS.DATA_COLLECTION_ACTIVE;
  });

  // Pending report reviews
  var pendingReviews = allReports.filter(function(r) {
    return r.aacahb_review_status === 'Pending Review';
  });

  return apiSuccess_({
    summary: {
      active_count:           active.length,
      suspended_count:        suspended.length,
      complete_count:         complete.length,
      closeout_pending_count: closeoutPending.length,
      archived_count:         archived.length,
      expired_count:          expired.length,
      overdue_count:          overdue.length,
      expiring_soon_count:    expiringSoon.length,
      pending_review_count:   pendingReviews.length
    },
    active_studies:       active,
    overdue_studies:      overdue,
    suspended_studies:    suspended,
    expiring_soon:        expiringSoon,
    expired_studies:      expired,
    closeout_pending:     closeoutPending,
    pending_reviews:      pendingReviews,
    recent_reports:       allReports.sort(function(a,b){ return new Date(b.report_date) - new Date(a.report_date); }).slice(0, 20),
    archived_studies:     archived
  });
}

// ----------------------------------------------------------------------------
// 10. GET PROTOCOL PROGRESS REPORTS (for protocol detail view)
// ----------------------------------------------------------------------------
function getProtocolProgressReports_(protocolId) {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  var reports = dbFind_(TABLES.DATA_COLLECTION_REPORTS, function(r) {
    return r.protocol_id === protocolId;
  });
  reports.sort(function(a, b) { return new Date(b.report_date) - new Date(a.report_date); });

  var closeout = dbFind_(TABLES.STUDY_CLOSEOUTS, function(c) {
    return c.protocol_id === protocolId;
  })[0] || null;

  return apiSuccess_({ reports: reports, closeout: closeout });
}

// ----------------------------------------------------------------------------
// 11. RESUME SUSPENDED DATA COLLECTION (Secretary / Chair)
// ----------------------------------------------------------------------------
function resumeDataCollection_(protocolId, resumeNotes) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found.');
    if (p.current_status !== STATUS.DATA_COLLECTION_SUSPENDED) {
      return apiError_('Protocol is not currently suspended.');
    }
    var nowIso = new Date().toISOString();
    dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      current_status: STATUS.DATA_COLLECTION_ACTIVE,
      current_stage:  'Data Collection Resumed',
      updated_at:     nowIso
    });
    createNotification_(p.pi_id || '', p.pi_email, protocolId,
      'Data Collection Resumed: ' + protocolId,
      'AACAHB has lifted the suspension on protocol ' + protocolId +
      '. You may resume data collection. ' + (resumeNotes || ''),
      'DATA_COLLECTION');
    logAuditEvent_(protocolId, user.user_id, user.full_name, user.role,
      'DATA_COLLECTION_RESUMED', STATUS.DATA_COLLECTION_SUSPENDED, STATUS.DATA_COLLECTION_ACTIVE,
      'Resumed by ' + user.full_name + '. Notes: ' + (resumeNotes || ''));
    return apiSuccess_({ protocolId: protocolId }, 'Data collection resumed for protocol ' + protocolId + '.');
  });
}
