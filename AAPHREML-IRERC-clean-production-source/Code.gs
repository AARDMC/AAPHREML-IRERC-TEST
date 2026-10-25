// ============================================================================
// Code.gs — Main Entry Point & Web Application Dispatcher for AAPHREML-IRERC
// Addis Ababa City Administration Health Bureau Institutional Research Ethics Review Committee
// ============================================================================

/**
 * Serves the Web Application user interface.
 */
function doGet(e) {
  var parameters = e && e.parameter ? e.parameter : {};

  // Bridge frame request from GitHub Pages RPC bridge
  if (String(parameters.bridge || '') === '1') {
    return HtmlService.createHtmlOutput(BRIDGE_HTML_)
      .setTitle('AAPHREML-IRERC Backend Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // Direct GAS access: serve the full portal
  var template = HtmlService.createTemplateFromFile('Index');
  var logoFile = AssetService_ ? AssetService_.getLogoDataUri() : '';
  template.logoDataUri = logoFile || '';
  return template.evaluate()
    .setTitle(CFG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}


/**
 * Template include_ helper to modularize CSS and HTML client scripts.
 * Example in Index.html: <?!= include_('styles/styles') ?>
 */
function include_(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
    Logger.log('[Include Error] Could not include_ ' + filename + ': ' + err.message);
    return '<!-- Error including ' + filename + ' -->';
  }
}

/**
 * Centralized API Dispatcher & Exception Guard.
 * Executes target function with arguments and catches unhandled exceptions,
 * returning a standardized JSON error response to client callers.
 */
var _API_SESSION_USER_ = null;
var _API_SESSION_TOKEN_ = '';

function _dispatch_(fn, args, isAuthenticationEndpoint) {
  var callArgs = Array.prototype.slice.call(args || []);
  var sessionToken = callArgs.length ? String(callArgs.pop() || '') : '';
  var previousUser = _API_SESSION_USER_;
  var previousToken = _API_SESSION_TOKEN_;
  var previousDbCache = typeof beginDbRequestCache_ === 'function' ? beginDbRequestCache_() : null;

  try {
    if (typeof fn !== 'function') {
      throw new Error('Service handler is not available.');
    }

    var user = _resolveSessionToken_(sessionToken);
    if (!isAuthenticationEndpoint && !user) {
      throw new Error('Authentication required. Please log in.');
    }

    _API_SESSION_USER_ = user;
    _API_SESSION_TOKEN_ = sessionToken;
    return fn.apply(null, callArgs);
  } catch (err) {
    Logger.log('[API Dispatch Error] ' + (err.stack || err.message));
    return typeof apiError_ === 'function' ? apiError_(err.message) : { success: false, error: err.message };
  } finally {
    _API_SESSION_USER_ = previousUser;
    _API_SESSION_TOKEN_ = previousToken;
    if (typeof endDbRequestCache_ === 'function') endDbRequestCache_(previousDbCache);
  }
}

// ============================================================================
// PUBLIC CLIENT-CALLABLE API (google.script.run)
// ============================================================================

// ---- 1. Authentication & Session ----
function apiGetSessionUser() { return _dispatch_(getSessionUser_, arguments, true); }
function apiLoginUser(email, password) { return _dispatch_(loginUser_, arguments, true); }
function apiLogoutUser() { return _dispatch_(logoutUser_, arguments, true); }
function apiGoogleAuth(payload) { return _dispatch_(googleAuth_, arguments, true); }

// ---- 2. Protocols & Directories ----
function apiGetAllProtocols(filters) { return _dispatch_(getAllProtocols_, arguments); }
function apiGetProtocolDetails(protocolId) { return _dispatch_(getProtocolDetails_, arguments); }
function apiGetNextProtocolCode() {
  return _dispatch_(function() {
    var code = typeof getNextProtocolCode_ === 'function' ? getNextProtocolCode_() : generateNextProtocolCode_();
    return typeof apiSuccess_ === 'function' ? apiSuccess_({ code: code }) : { success: true, data: { code: code } };
  }, arguments);
}

// ---- 3. Submission & Validation ----
function apiSubmitNewProtocol(payload) { return _dispatch_(submitNewProtocol_, arguments); }

// ---- 4. Administrative Screening ----
function apiMarkProtocolReceived(protocolId) { return _dispatch_(markProtocolReceived_, arguments); }
function apiPerformAdministrativeCheck(protocolId, checkResults, generalNotes) { return _dispatch_(performAdministrativeCheck_, arguments); }
function apiClassifyReviewType(protocolId, reviewType, justification) { return _dispatch_(classifyReviewType_, arguments); }

// ---- 5. Reviewer Assignment & COI ----
function apiGetAvailableReviewers(studyCategory) { return _dispatch_(getAvailableReviewers_, arguments); }
function apiGetReviewerWorkload() { return _dispatch_(getReviewerWorkload_, arguments); }
function apiAssignReviewers(protocolId, reviewerList, deadlineDays, notes) { return _dispatch_(assignReviewersToProtocol_, arguments); }
function apiReassignReviewer(assignmentId, newReviewer, reason) { return _dispatch_(reassignReviewer_, arguments); }
function apiDeclareReviewerCoi(assignmentId, hasConflict, details) { return _dispatch_(declareReviewerCoi_, arguments); }

// ---- 6. Study Assessments ----
function apiPrepareAssessmentForm(protocolId, reviewerId) { return _dispatch_(prepareAssessmentForm_, arguments); }
function apiSubmitCompletedAssessment(payload) { return _dispatch_(submitCompletedAssessment_, arguments); }
function apiGetGatheredAssessmentReports(protocolId) { return _dispatch_(getGatheredAssessmentReports_, arguments); }

// ---- 7. Expedited Review ----
function apiRecordExpeditedClassification(protocolId, payload) { return _dispatch_(recordExpeditedClassification_, arguments); }
function apiSubmitExpeditedDecision(protocolId, payload) { return _dispatch_(submitExpeditedReviewDecision_, arguments); }

// ---- 8. IRERC Decisions & Communications ----
function apiRecordFormalDecision(payload) { return _dispatch_(recordFormalDecision_, arguments); }
function apiVerifyConditionCompliance(conditionId, notes) { return _dispatch_(verifyConditionCompliance_, arguments); }
function apiSendDecisionCommunication(payload) { return _dispatch_(sendDecisionCommunication_, arguments); }
function apiGetMyNotifications() { return _dispatch_(getMyNotifications_, arguments); }
function apiMarkNotificationRead(notifId) { return _dispatch_(markNotificationRead_, arguments); }

// ---- 9. Amendments, Continuing Review & Termination ----
function apiSubmitProtocolAmendment(payload) { return _dispatch_(submitProtocolAmendment_, arguments); }
function apiClassifyAmendment(amendmentId, reviewPath, justification) { return _dispatch_(classifyAmendmentReviewPath_, arguments); }
function apiSubmitContinuingReview(payload) { return _dispatch_(submitContinuingReview_, arguments); }
function apiSubmitProtocolTermination(payload) { return _dispatch_(submitProtocolTermination_, arguments); }

// ---- 10. Post-Clearance Data Collection Monitoring ----
function apiStartDataCollection(protocolId, actualStartDate, confirmationStatement) { return _dispatch_(startDataCollection_, arguments); }
function apiSubmitProgressReport(payload) { return _dispatch_(submitProgressReport_, arguments); }
function apiReviewProgressReport(reportId, reviewStatus, comments, suspendProtocol) { return _dispatch_(reviewProgressReport_, arguments); }
function apiDeclareDataCollectionComplete(protocolId, completionDate, completionNotes) { return _dispatch_(declareDataCollectionComplete_, arguments); }
function apiSubmitStudyCloseout(payload) { return _dispatch_(submitStudyCloseout_, arguments); }
function apiAcceptStudyCloseout(closeoutId, acceptanceNotes, returnForRevision) { return _dispatch_(acceptStudyCloseout_, arguments); }
function apiResumeDataCollection(protocolId, resumeNotes) { return _dispatch_(resumeDataCollection_, arguments); }
function apiGetProtocolProgressReports(protocolId) { return _dispatch_(getProtocolProgressReports_, arguments); }
function apiGetMonitoringDashboard() { return _dispatch_(getMonitoringDashboard_, arguments); }
function apiCheckOverdueProgressReports() { return _dispatch_(checkOverdueProgressReports_, arguments); }
function apiCheckExpiredClearances() { return _dispatch_(checkExpiredClearances_, arguments); }

// ---- 11. Documents & Vault ----
function apiUploadProtocolDocument(payload) { return _dispatch_(uploadProtocolDocument_, arguments); }
function apiGetProtocolDocuments(protocolId) { return _dispatch_(getProtocolDocumentsWithHistory_, arguments); }
function apiVerifyDocument(docId, newStatus, notes) { return _dispatch_(verifyDocument_, arguments); }

// ---- 12. Meetings ----
function apiGetAllMeetings() { return _dispatch_(getAllMeetings_, arguments); }
function apiScheduleMeeting(payload) { return _dispatch_(scheduleMeeting_, arguments); }
function apiGetMeetingDetails(meetingId) { return _dispatch_(getMeetingDetails_, arguments); }
function apiConcludeMeeting(payload) { return _dispatch_(concludeMeetingWithDecisions_, arguments); }

// ---- 13. Committee & Users ----
function apiGetCommitteeMembers() { return _dispatch_(getCommitteeMembers_, arguments); }
function apiGetInvestigators() { return _dispatch_(getInvestigators_, arguments); }
function apiSaveCommitteeMember(memberData) { return _dispatch_(saveCommitteeMember_, arguments); }
function apiRegisterInvestigator(invData) { return _dispatch_(registerInvestigator_, arguments, true); }
function apiGetChairSignature() {
  return _dispatch_(function() {
    requireAuthorizedRole_([ROLES.ADMIN, ROLES.SECRETARIAT, ROLES.CHAIR]);
    return apiSuccess_({ data_uri: getSignatureDataUri_() });
  }, arguments);
}

// ---- 14. Reports, Dashboard & Audit ----
function apiGetDashboardMetrics(filters) { return _dispatch_(getDashboardMetrics_, arguments); }
function apiGenerateReport(reportType, filters) { return _dispatch_(generateInstitutionalReport_, arguments); }
function apiGetProtocolAuditTrail(protocolId) { return _dispatch_(getProtocolAuditTrail_, arguments); }
function apiGetSystemAuditLogs(filters) { return _dispatch_(getSystemAuditLogs_, arguments); }

// ---- 15. System Initialization ----
function apiInitDatabase() {
  return _dispatch_(function() {
    requireAuthorizedRole_([ROLES.ADMIN]);
    return initDatabase_();
  }, arguments);
}

// ---- 16. AAPHREML-IRERC Portal Functions & Proposal Scanner ----
function apiProcessUploadedFile(fileName, fileData) { return _dispatch_(processUploadedFile_, arguments); }
function apiDeleteFileFromDrive(storedName) { return _dispatch_(deleteFileFromDrive_, arguments); }
function apiGenerateNextProtocolCode() { return _dispatch_(generateNextProtocolCode_, arguments); }
function apiIsSubmissionEditable(code, piEmail) { return _dispatch_(isSubmissionEditable_, arguments); }
function apiLoadForEdit(code, email) { return _dispatch_(loadForEdit_, arguments); }
function apiProcessFormSubmission(req) { return _dispatch_(processFormSubmission_, arguments); }

// ============================================================================
// LEGACY COMPATIBILITY & DIRECT WRAPPERS
// Ensures backward compatibility with gas() caller and older workflow scripts
// ============================================================================

/**
 * Returns current authenticated user with fallback.
 */
function getCurrentUser_() {
  var sess = typeof getSessionUser_ === 'function' ? getSessionUser_() : null;
  if (!sess) throw new Error('Authentication required. Please log in.');
  return { email: sess.email, name: sess.full_name, role: sess.role, status: 'Active' };
}

/**
 * Formats dashboard protocols for legacy views using centralized protocols query.
 */
function getDashboardData_(view) {
  var u = getCurrentUser_();
  var me = (u.email || '').toLowerCase();
  var quorum = (typeof CFG !== 'undefined' && CFG.ETHICS_QUORUM) ? CFG.ETHICS_QUORUM : 2;
  var protocols = typeof getAllProtocols_ === 'function' ? (getAllProtocols_().data || []) : [];

  return protocols.filter(function(p) {
    if (view === 'Researcher') return String(p.pi_email || '').toLowerCase() === me;
    if (view === 'Secretariat') return !p.is_archived;
    if (view === 'Reviewer') return String(p.lead_reviewer_id || '').toLowerCase() === me;
    if (view === 'Ethics') return p.current_status === 'Under Review' || p.current_status === 'S6 - Reviewed';
    if (view === 'Chair') return p.current_status === 'IRERC Decision Pending' || p.current_status === 'S7 - Ethics Approved';
    if (view === 'Archive') return !!p.is_archived;
    return true;
  }).map(function(p) {
    return {
      id: str_(p.protocol_id),
      title: str_(p.study_title),
      piName: str_(p.pi_name),
      status: str_(p.current_status),
      deadline: str_(p.expiry_date),
      review: str_(p.current_stage),
      approvals: p.current_status === 'Approved' ? quorum : 0,
      quorum: quorum,
      done: p.current_status === 'Approved',
      letter: ''
    };
  });
}

/**
 * Assigns reviewer to protocol (delegates to centralized Reviews service).
 */
function assignReviewer_(protocolId, reviewerEmail) {
  if (!reviewerEmail || (typeof isValidEmail_ === 'function' && !isValidEmail_(reviewerEmail))) {
    throw new Error('Invalid reviewer email.');
  }
  if (typeof assignReviewersToProtocol_ === 'function') {
    return assignReviewersToProtocol_(protocolId, [{ email: reviewerEmail, full_name: reviewerEmail }], 7, 'Assigned via quick action');
  }
  return 'Reviewer assigned.';
}

/**
 * Computes deadline in working days (delegates to centralized Utils service).
 */
function calculateDeadline_(startDate, daysToAdd) {
  if (typeof calculateWorkingDaysDeadline_ === 'function') {
    return new Date(calculateWorkingDaysDeadline_(startDate, daysToAdd || 7));
  }
  var d = new Date(startDate);
  d.setDate(d.getDate() + (daysToAdd || 7));
  return d;
}

/**
 * Submits review decision (delegates to Assessments service).
 */
function submitReview_(id, decision, comments) {
  if (['Recommend', 'Return'].indexOf(decision) === -1) throw new Error('Invalid decision.');
  if (typeof submitCompletedAssessment_ === 'function') {
    return submitCompletedAssessment_({
      protocol_id: id,
      recommendation: decision === 'Recommend' ? 'Approved' : 'Modifications Required',
      summary_notes: comments || ''
    });
  }
  return 'Review submitted.';
}

/**
 * Records ethics committee quorum approval.
 */
function ethicsApprove_(id) {
  if (typeof recordFormalDecision_ === 'function') {
    return recordFormalDecision_({
      protocol_id: id,
      decision_type: 'Approved',
      summary_comments: 'Quorum ethics approval recorded.'
    });
  }
  return 'Approval recorded.';
}

/**
 * Records chairperson clearance decision.
 */
function chairDecide_(id, decision, remarks) {
  if (typeof recordFormalDecision_ === 'function') {
    return recordFormalDecision_({
      protocol_id: id,
      decision_type: decision === 'Return' ? 'Modifications Required' : 'Approved',
      summary_comments: remarks || 'Chairperson formal review concluded.'
    });
  }
  return decision === 'Return' ? 'Protocol returned.' : 'Approved, letter signed and protocol archived.';
}

/**
 * Safe string / date formatter helper.
 */
function str_(v) {
  if (v instanceof Date) {
    try {
      return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Africa/Addis_Ababa', 'yyyy-MM-dd');
    } catch (e) {
      return v.toISOString().substring(0, 10);
    }
  }
  return (v == null ? '' : String(v));
}

/**
 * Audit log proxy helper for legacy caller support.
 */
function logStatus_(protocolId, status, userEmail, note) {
  if (typeof logAuditEvent_ === 'function') {
    return logAuditEvent_(protocolId, '', userEmail || 'System', 'Legacy', 'STATUS_CHANGE', '', status, note || '');
  }
}
