// ============================================================================
// Protocols.gs — Protocol Lifecycle, State Machine & Master Directory
// ============================================================================

/**
 * Validates whether a state transition is legal according to IRERC rules.
 */
function isValidStateTransition_(currentStatus, targetStatus, userRole) {
  // Admin can override any transition
  if (userRole === ROLES.ADMIN) return true;

  var allowedTransitions = {};
  allowedTransitions[STATUS.DRAFT] = [STATUS.SUBMITTED];
  allowedTransitions[STATUS.SUBMITTED] = [STATUS.ADMINISTRATIVE_CHECK, STATUS.CORRECTION_REQUIRED];
  allowedTransitions[STATUS.ADMINISTRATIVE_CHECK] = [STATUS.CORRECTION_REQUIRED, STATUS.COMPLETE];
  allowedTransitions[STATUS.CORRECTION_REQUIRED] = [STATUS.SUBMITTED];
  allowedTransitions[STATUS.COMPLETE] = [STATUS.REVIEW_TYPE_CLASSIFICATION, STATUS.REVIEWER_ASSIGNED];
  allowedTransitions[STATUS.REVIEW_TYPE_CLASSIFICATION] = [STATUS.REVIEWER_ASSIGNED];
  allowedTransitions[STATUS.REVIEWER_ASSIGNED] = [STATUS.UNDER_REVIEW];
  allowedTransitions[STATUS.UNDER_REVIEW] = [STATUS.ASSESSMENT];
  allowedTransitions[STATUS.ASSESSMENT] = [STATUS.IRERC_DECISION, STATUS.PRELIMINARY_DECISION];
  allowedTransitions[STATUS.IRERC_DECISION] = [
    STATUS.PRELIMINARY_DECISION,
    STATUS.FINAL_DECISION,
    STATUS.MODIFICATIONS_REQUIRED,
    STATUS.CORRECTION_REQUIRED
  ];
  allowedTransitions[STATUS.PRELIMINARY_DECISION] = [STATUS.FINAL_DECISION, STATUS.COMMUNICATED];
  allowedTransitions[STATUS.FINAL_DECISION] = [STATUS.COMMUNICATED, STATUS.ARCHIVED];
  allowedTransitions[STATUS.COMMUNICATED] = [
    STATUS.AMENDMENT_PENDING,
    STATUS.CONTINUING_REVIEW_DUE,
    STATUS.CONTINUING_REVIEW_PENDING,
    STATUS.TERMINATED,
    STATUS.ARCHIVED
  ];
  allowedTransitions[STATUS.AMENDMENT_PENDING] = [STATUS.REVIEWER_ASSIGNED, STATUS.COMMUNICATED];
  allowedTransitions[STATUS.CONTINUING_REVIEW_PENDING] = [STATUS.COMMUNICATED];
  allowedTransitions[STATUS.TERMINATED] = [STATUS.ARCHIVED];

  var validNextList = allowedTransitions[currentStatus] || [];
  return validNextList.indexOf(targetStatus) !== -1;
}

/**
 * Executes a controlled state transition with audit logging.
 */
function transitionProtocolStatus_(protocolId, newStatus, comments) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required.');

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) throw new Error('Protocol not found: ' + protocolId);

    var prevStatus = p.current_status;
    if (prevStatus === newStatus) return p;

    if (!isValidStateTransition_(prevStatus, newStatus, user.role)) {
      throw new Error('Illegal state transition from "' + prevStatus + '" to "' + newStatus + '" for role: ' + user.role);
    }

    var updated = dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      current_status: newStatus,
      current_stage: newStatus,
      updated_at: new Date().toISOString()
    });

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'STATUS_CHANGE',
      prevStatus,
      newStatus,
      comments || ('Status transitioned to ' + newStatus)
    );

    return updated;
  });
}

/**
 * Retrieves all protocols with role-based access filtering and search criteria.
 */
function getAllProtocols_(filters) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required.');

  var f = filters || {};
  var allProtocols = dbGetAll_(TABLES.PROTOCOLS);

  // 1. Role-based scoping
  var scopedProtocols = allProtocols;
  if (user.role === ROLES.INVESTIGATOR) {
    scopedProtocols = allProtocols.filter(function(p) {
      return String(p.pi_email).toLowerCase() === String(user.email).toLowerCase() || p.pi_id === user.user_id;
    });
  } else if (user.role === ROLES.REVIEWER) {
    // Reviewers only see protocols assigned to them
    var myAssignments = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
      return (a.reviewer_id === user.user_id || String(a.reviewer_email).toLowerCase() === String(user.email).toLowerCase()) && a.status !== 'Cancelled';
    });
    var assignedIds = myAssignments.map(function(a) { return a.protocol_id; });

    scopedProtocols = allProtocols.filter(function(p) {
      return assignedIds.indexOf(p.protocol_id) !== -1;
    });
  } else if (user.role === ROLES.CHAIR || user.role === ROLES.VICE_CHAIR) {
    // Directors only see protocols assigned to them OR at decision stages
    var directorAssigns = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
      return (a.reviewer_id === user.user_id || String(a.reviewer_email).toLowerCase() === String(user.email).toLowerCase()) && a.status !== 'Cancelled';
    });
    var directorPids = directorAssigns.map(function(a) { return a.protocol_id; });
    var decisionStatuses = [STATUS.ASSESSMENT, STATUS.IRERC_DECISION, STATUS.PRELIMINARY_DECISION, STATUS.FINAL_DECISION];

    scopedProtocols = allProtocols.filter(function(p) {
      return directorPids.indexOf(p.protocol_id) !== -1 || decisionStatuses.indexOf(p.current_status) !== -1;
    });
  }

  // 2. Query Filtering
  var filtered = scopedProtocols.filter(function(p) {
    if (f.search && f.search.trim() !== '') {
      var q = f.search.trim().toLowerCase();
      var matchId = String(p.protocol_id || '').toLowerCase().indexOf(q) !== -1;
      var matchTitle = String(p.study_title || '').toLowerCase().indexOf(q) !== -1;
      var matchPi = String(p.pi_name || '').toLowerCase().indexOf(q) !== -1;
      var matchInst = String(p.institution_name || '').toLowerCase().indexOf(q) !== -1;
      if (!matchId && !matchTitle && !matchPi && !matchInst) return false;
    }

    if (f.status && f.status !== 'ALL' && p.current_status !== f.status) return false;
    if (f.review_type && f.review_type !== 'ALL' && p.review_type !== f.review_type) return false;
    if (f.application_type && f.application_type !== 'ALL' && p.application_type !== f.application_type) return false;
    if (f.study_category && f.study_category !== 'ALL' && p.study_category !== f.study_category) return false;

    return true;
  });

  // Sort descending by submission date
  filtered.sort(function(a, b) {
    return new Date(b.submission_date || b.created_at) - new Date(a.submission_date || a.created_at);
  });

  return apiSuccess_(filtered);
}

/**
 * Retrieves full comprehensive protocol details across all 12 operational tabs.
 */
function getProtocolDetails_(protocolId) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required.');

  if (!protocolId) return apiError_('Protocol ID is required.');

  var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
  if (!p) return apiError_('Protocol not found: ' + protocolId);

  // Access control
  if (user.role === ROLES.INVESTIGATOR) {
    if (String(p.pi_email).toLowerCase() !== String(user.email).toLowerCase() && p.pi_id !== user.user_id) {
      throw new Error('Access denied to this protocol.');
    }
  } else if (user.role === ROLES.REVIEWER) {
    var assignments = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
      return a.protocol_id === protocolId && (a.reviewer_id === user.user_id || String(a.reviewer_email).toLowerCase() === String(user.email).toLowerCase());
    });
    if (assignments.length === 0) {
      throw new Error('You are not assigned to review this protocol.');
    }
  }

  // Fetch linked records
  var details = dbFind_(TABLES.PROTOCOL_DETAILS, function(d) { return d.protocol_id === protocolId; })[0] || {};
  var ethics = dbFind_(TABLES.PROTOCOL_ETHICS, function(e) { return e.protocol_id === protocolId; })[0] || {};
  var documents = dbFind_(TABLES.PROTOCOL_DOCUMENTS, function(d) { return d.protocol_id === protocolId; });
  var versions = dbFind_(TABLES.PROTOCOL_VERSIONS, function(v) { return v.protocol_id === protocolId; });
  var reviewerAssignments = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) { return a.protocol_id === protocolId; });
  var assessments = dbFind_(TABLES.ASSESSMENT_FORMS, function(af) { return af.protocol_id === protocolId; });
  var assessmentItems = dbFind_(TABLES.ASSESSMENT_ITEMS, function(ai) { return ai.protocol_id === protocolId; });
  var expedited = dbFind_(TABLES.EXPEDITED_DETERMINATIONS, function(ed) { return ed.protocol_id === protocolId; })[0] || null;
  var decisions = dbFind_(TABLES.DECISIONS, function(dec) { return dec.protocol_id === protocolId; });
  var conditions = dbFind_(TABLES.DECISION_CONDITIONS, function(dc) { return dc.protocol_id === protocolId; });
  var amendments = dbFind_(TABLES.AMENDMENTS, function(am) { return am.protocol_id === protocolId; });
  var continuingReviews = dbFind_(TABLES.CONTINUING_REVIEWS, function(cr) { return cr.protocol_id === protocolId; });
  var terminations = dbFind_(TABLES.TERMINATIONS, function(tm) { return tm.protocol_id === protocolId; })[0] || null;
  var communications = dbFind_(TABLES.COMMUNICATIONS, function(cm) { return cm.protocol_id === protocolId; });
  var auditTrail = dbFind_(TABLES.AUDIT_LOGS, function(al) { return al.protocol_id === protocolId; });

  return apiSuccess_({
    protocol: p,
    details: details,
    ethics: ethics,
    documents: documents,
    versions: versions,
    reviewer_assignments: reviewerAssignments,
    assessments: assessments,
    assessment_items: assessmentItems,
    expedited: expedited,
    decisions: decisions,
    conditions: conditions,
    amendments: amendments,
    continuing_reviews: continuingReviews,
    termination: terminations,
    communications: communications,
    audit_trail: auditTrail
  });
}
