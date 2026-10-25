// ============================================================================
// Reports.gs — 14 Institutional Compliance Reports & Data Exporters
// ============================================================================

/**
 * Master Report Generator across all 14 institutional compliance categories.
 */
function generateInstitutionalReport_(reportType, filters) {
  requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.ADMIN]);

  var f = filters || {};
  var allProtocols = dbGetAll_(TABLES.PROTOCOLS);
  var reportData = [];
  var reportTitle = '';
  var columns = [];

  switch (reportType) {
    case 'SUBMISSION_REPORT':
      reportTitle = 'Protocol Submission Report';
      columns = ['Protocol ID', 'Study Title', 'Principal Investigator', 'Institution', 'Application Type', 'Submission Date', 'Status'];
      reportData = allProtocols.map(function(p) {
        return [p.protocol_id, p.study_title, p.pi_name, p.institution_name, p.application_type, formatDateIso_(p.submission_date), p.current_status];
      });
      break;

    case 'PENDING_PROTOCOLS':
      reportTitle = 'Pending Protocols Under Review';
      columns = ['Protocol ID', 'Study Title', 'PI', 'Review Type', 'Current Stage', 'Submission Date', 'Lead Reviewer'];
      reportData = allProtocols.filter(function(p) {
        return p.current_status !== STATUS.APPROVED && p.current_status !== STATUS.TERMINATED && p.current_status !== STATUS.ARCHIVED;
      }).map(function(p) {
        return [p.protocol_id, p.study_title, p.pi_name, p.review_type, p.current_stage, formatDateIso_(p.submission_date), p.lead_reviewer_name || 'Unassigned'];
      });
      break;

    case 'APPROVED_PROTOCOLS':
      reportTitle = 'Approved Research Protocols';
      columns = ['Protocol ID', 'Study Title', 'PI', 'Institution', 'Approval Date', 'Expiry Date', 'Review Type'];
      reportData = allProtocols.filter(function(p) {
        return p.current_status === STATUS.APPROVED || p.current_status === STATUS.APPROVED_WITH_CONDITIONS;
      }).map(function(p) {
        return [p.protocol_id, p.study_title, p.pi_name, p.institution_name, formatDateIso_(p.approval_date), formatDateIso_(p.expiry_date), p.review_type];
      });
      break;

    case 'REJECTED_PROTOCOLS':
      reportTitle = 'Rejected / Not Approved Protocols';
      columns = ['Protocol ID', 'Study Title', 'PI', 'Institution', 'Review Type', 'Status', 'Updated Date'];
      reportData = allProtocols.filter(function(p) {
        return p.current_status === STATUS.NOT_APPROVED;
      }).map(function(p) {
        return [p.protocol_id, p.study_title, p.pi_name, p.institution_name, p.review_type, p.current_status, formatDateIso_(p.updated_at)];
      });
      break;

    case 'EXPEDITED_REVIEW_REPORT':
      reportTitle = 'Expedited Review Determinations Report';
      columns = ['Protocol ID', 'Study Title', 'Classified By', 'Classification Date', 'Consulted Chair', 'Decision'];
      var expData = dbGetAll_(TABLES.EXPEDITED_DETERMINATIONS);
      reportData = expData.map(function(e) {
        var p = dbFindById_(TABLES.PROTOCOLS, e.protocol_id) || {};
        return [e.protocol_id, p.study_title || '', e.classified_by, formatDateIso_(e.classification_date), e.consulted_chair_id, e.decision];
      });
      break;

    case 'FULL_REVIEW_REPORT':
      reportTitle = 'Full Board Review Protocols Report';
      columns = ['Protocol ID', 'Study Title', 'PI', 'Institution', 'Submission Date', 'Current Status'];
      reportData = allProtocols.filter(function(p) {
        return p.review_type === REVIEW_TYPES.FULL_BOARD;
      }).map(function(p) {
        return [p.protocol_id, p.study_title, p.pi_name, p.institution_name, formatDateIso_(p.submission_date), p.current_status];
      });
      break;

    case 'AMENDMENT_REPORT':
      reportTitle = 'Protocol Amendments Summary Report';
      columns = ['Amendment ID', 'Protocol ID', 'Amendment Title', 'Type', 'Review Path', 'Submission Date', 'Status'];
      var amds = dbGetAll_(TABLES.AMENDMENTS);
      reportData = amds.map(function(a) {
        return [a.amendment_number, a.protocol_id, a.amendment_title, a.amendment_type, a.review_path, formatDateIso_(a.submission_date), a.status];
      });
      break;

    case 'CONTINUING_REVIEW_REPORT':
      reportTitle = 'Continuing Review & Progress Monitoring Report';
      columns = ['Report ID', 'Protocol ID', 'Current Study Status', 'Target Sample', 'Enrolled to Date', 'Adverse Events', 'Submission Date'];
      var crs = dbGetAll_(TABLES.CONTINUING_REVIEWS);
      reportData = crs.map(function(c) {
        return [c.cont_review_id, c.protocol_id, c.current_study_status, c.target_sample_size, c.enrolled_participants, c.adverse_events_count, formatDateIso_(c.submission_date)];
      });
      break;

    case 'TERMINATED_REPORT':
      reportTitle = 'Terminated / Concluded Protocols Report';
      columns = ['Termination ID', 'Protocol ID', 'Reason for Termination', 'Completion Status', 'Participants Enrolled', 'Archived Date'];
      var terms = dbGetAll_(TABLES.TERMINATIONS);
      reportData = terms.map(function(t) {
        return [t.termination_id, t.protocol_id, t.reason_for_termination, t.study_completion_status, t.total_participants_enrolled, formatDateIso_(t.archival_date)];
      });
      break;

    case 'REVIEWER_WORKLOAD_REPORT':
      reportTitle = 'Reviewer Workload & Assignment Distribution';
      columns = ['Reviewer Name', 'Category', 'Email', 'Active Assignments', 'COI Status'];
      var workload = getReviewerWorkload_().data;
      reportData = workload.map(function(w) {
        return [w.full_name, w.professional_category, w.email, w.active_assignments_count, w.coi_status];
      });
      break;

    case 'PROCESSING_TIME_REPORT':
      reportTitle = 'Protocol Review Processing Time Analysis';
      columns = ['Protocol ID', 'Submission Date', 'Approval Date', 'Total Days to Decision', 'Review Type', 'Final Status'];
      reportData = allProtocols.filter(function(p) {
        return p.submission_date && (p.approval_date || p.updated_at);
      }).map(function(p) {
        var start = new Date(p.submission_date).getTime();
        var end = new Date(p.approval_date || p.updated_at).getTime();
        var days = Math.round((end - start) / (1000 * 60 * 60 * 24));
        return [p.protocol_id, formatDateIso_(p.submission_date), formatDateIso_(p.approval_date || p.updated_at), days >= 0 ? days : 0, p.review_type, p.current_status];
      });
      break;

    case 'DECISION_REPORT':
      reportTitle = 'Formal IRERC Decisions Registry';
      columns = ['Decision ID', 'Protocol ID', 'Decision Outcome', 'Decision Date', 'Chairperson', 'Quorum Count', 'Valid Until'];
      var decs = dbGetAll_(TABLES.DECISIONS);
      reportData = decs.map(function(d) {
        return [d.decision_id, d.protocol_id, d.decision_type, formatDateIso_(d.decision_date), d.chairperson_name, d.quorum_members_count, formatDateIso_(d.valid_until_date)];
      });
      break;

    case 'DOCUMENT_COMPLETENESS_REPORT':
      reportTitle = 'Submission Document Completeness Audit';
      columns = ['Protocol ID', 'Document Title', 'Type', 'Version', 'Status', 'Verified By'];
      var docs = dbGetAll_(TABLES.PROTOCOL_DOCUMENTS);
      reportData = docs.map(function(d) {
        return [d.protocol_id, d.document_title, d.doc_type, d.current_version, d.status, d.verified_by || 'Unverified'];
      });
      break;

    case 'IRERC_ACTIVITY_REPORT':
    default:
      reportTitle = 'IRERC Committee Comprehensive Activity Overview';
      columns = ['Metric', 'Count / Value'];
      reportData = [
        ['Total Protocols Submitted', allProtocols.length],
        ['Active Under Review', allProtocols.filter(function(p){ return p.current_status === STATUS.UNDER_REVIEW || p.current_status === STATUS.REVIEWER_ASSIGNED; }).length],
        ['Approved Protocols', allProtocols.filter(function(p){ return p.current_status === STATUS.APPROVED || p.current_status === STATUS.APPROVED_WITH_CONDITIONS; }).length],
        ['Expedited Protocols', allProtocols.filter(function(p){ return p.review_type === REVIEW_TYPES.EXPEDITED; }).length],
        ['Full Board Protocols', allProtocols.filter(function(p){ return p.review_type === REVIEW_TYPES.FULL_BOARD; }).length],
        ['Amendments Logged', dbGetAll_(TABLES.AMENDMENTS).length],
        ['Continuing Reviews Logged', dbGetAll_(TABLES.CONTINUING_REVIEWS).length],
        ['Meetings Held', dbGetAll_(TABLES.IRERC_MEETINGS).length]
      ];
      break;
  }

  return apiSuccess_({
    title: reportTitle,
    columns: columns,
    rows: reportData,
    generated_at: new Date().toISOString()
  });
}
