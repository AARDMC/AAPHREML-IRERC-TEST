// ============================================================================
// Dashboard.gs — Executive Dashboard Analytics, Workload Metrics & Charts
// ============================================================================

/**
 * Aggregates all 16 institutional dashboard metrics, 8 chart datasets & pending actions.
 */
function getDashboardMetrics_(filters) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required.');

  var f = filters || {};
  var allProtocols = dbGetAll_(TABLES.PROTOCOLS);

  // Apply scoping
  if (user.role === ROLES.INVESTIGATOR) {
    allProtocols = allProtocols.filter(function(p) {
      return String(p.pi_email).toLowerCase() === String(user.email).toLowerCase() || p.pi_id === user.user_id;
    });
  } else if (user.role === ROLES.REVIEWER) {
    var myAssigns = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
      return a.reviewer_id === user.user_id || String(a.reviewer_email).toLowerCase() === String(user.email).toLowerCase();
    });
    var myPids = myAssigns.map(function(a) { return a.protocol_id; });
    allProtocols = allProtocols.filter(function(p) {
      return myPids.indexOf(p.protocol_id) !== -1;
    });
  } else if (user.role === ROLES.CHAIR || user.role === ROLES.VICE_CHAIR) {
    // Directors only see protocols assigned to them OR at decision stages
    var dirAssigns = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
      return (a.reviewer_id === user.user_id || String(a.reviewer_email).toLowerCase() === String(user.email).toLowerCase()) && a.status !== 'Cancelled';
    });
    var dirPids = dirAssigns.map(function(a) { return a.protocol_id; });
    var decStatuses = [STATUS.ASSESSMENT, STATUS.IRERC_DECISION, STATUS.PRELIMINARY_DECISION, STATUS.FINAL_DECISION];
    allProtocols = allProtocols.filter(function(p) {
      return dirPids.indexOf(p.protocol_id) !== -1 || decStatuses.indexOf(p.current_status) !== -1;
    });
  }

  // Apply query filters
  var filtered = allProtocols.filter(function(p) {
    if (f.review_type && f.review_type !== 'ALL' && p.review_type !== f.review_type) return false;
    if (f.status && f.status !== 'ALL' && p.current_status !== f.status) return false;
    if (f.study_category && f.study_category !== 'ALL' && p.study_category !== f.study_category) return false;
    if (f.date_from && p.submission_date && p.submission_date < f.date_from) return false;
    if (f.date_to && p.submission_date && p.submission_date > f.date_to) return false;
    return true;
  });

  var now = new Date().getTime();
  var overdueCount = 0;

  var allAssignments = dbGetAll_(TABLES.REVIEWER_ASSIGNMENTS);
  allAssignments.forEach(function(a) {
    if (a.status === 'Assigned' || a.status === 'In Progress') {
      if (a.deadline_date && new Date(a.deadline_date).getTime() < now) {
        overdueCount++;
      }
    }
  });

  // 16 Exact Metrics
  var stats = {
    total_submitted: filtered.length,
    new_submissions: filtered.filter(function(p){ return p.current_status === STATUS.SUBMITTED; }).length,
    under_admin_review: filtered.filter(function(p){ return p.current_status === STATUS.ADMINISTRATIVE_CHECK; }).length,
    in_initial_review: filtered.filter(function(p){ return p.current_status === STATUS.UNDER_REVIEW; }).length,
    under_expedited_review: filtered.filter(function(p){ return p.review_type === REVIEW_TYPES.EXPEDITED && p.current_status !== STATUS.APPROVED && p.current_status !== STATUS.ARCHIVED; }).length,
    under_full_board_review: filtered.filter(function(p){ return p.review_type === REVIEW_TYPES.FULL_BOARD && p.current_status !== STATUS.APPROVED && p.current_status !== STATUS.ARCHIVED; }).length,
    awaiting_investigator_correction: filtered.filter(function(p){ return p.current_status === STATUS.CORRECTION_REQUIRED; }).length,
    awaiting_irerc_decision: filtered.filter(function(p){ return p.current_status === STATUS.ASSESSMENT || p.current_status === STATUS.IRERC_DECISION; }).length,
    approved: filtered.filter(function(p){ return p.current_status === STATUS.APPROVED; }).length,
    approved_with_conditions: filtered.filter(function(p){ return p.current_status === STATUS.APPROVED_WITH_CONDITIONS; }).length,
    modifications_required: filtered.filter(function(p){ return p.current_status === STATUS.MODIFICATIONS_REQUIRED; }).length,
    rejected_not_approved: filtered.filter(function(p){ return p.current_status === STATUS.NOT_APPROVED; }).length,
    terminated: filtered.filter(function(p){ return p.current_status === STATUS.TERMINATED; }).length,
    continuing_review_due: filtered.filter(function(p){ return p.current_status === STATUS.CONTINUING_REVIEW_DUE || p.current_status === STATUS.CONTINUING_REVIEW_PENDING; }).length,
    amendments_pending: filtered.filter(function(p){ return p.current_status === STATUS.AMENDMENT_PENDING; }).length,
    overdue_reviews: overdueCount
  };

  // 8 Chart Aggregations
  // 1. By Status
  var byStatus = {};
  filtered.forEach(function(p){ byStatus[p.current_status] = (byStatus[p.current_status] || 0) + 1; });

  // 2. By Review Type
  var byReviewType = {};
  filtered.forEach(function(p){ byReviewType[p.review_type || 'Unclassified'] = (byReviewType[p.review_type || 'Unclassified'] || 0) + 1; });

  // 3. By Month
  var byMonth = {};
  filtered.forEach(function(p){
    if (p.submission_date) {
      var m = p.submission_date.substring(0, 7); // YYYY-MM
      byMonth[m] = (byMonth[m] || 0) + 1;
    }
  });

  // 4. By Study Category
  var byCategory = {};
  filtered.forEach(function(p){ byCategory[p.study_category || 'Other'] = (byCategory[p.study_category || 'Other'] || 0) + 1; });

  // 5. By Decision
  var byDecision = {
    'Approved': stats.approved,
    'Approved with Conditions': stats.approved_with_conditions,
    'Modifications Required': stats.modifications_required,
    'Not Approved': stats.rejected_not_approved
  };

  // 6. Reviewer Workload
  var reviewerWorkload = getReviewerWorkload_().data;

  // 7. Average Processing Time (days)
  var totalDays = 0, countCompleted = 0;
  filtered.forEach(function(p){
    if (p.submission_date && p.approval_date) {
      var d = Math.round((new Date(p.approval_date).getTime() - new Date(p.submission_date).getTime()) / (1000 * 60 * 60 * 24));
      if (d >= 0) { totalDays += d; countCompleted++; }
    }
  });
  var avgProcessingDays = countCompleted > 0 ? Math.round(totalDays / countCompleted) : 14;

  // 8. Pending Actions
  var pendingActions = [];
  if (user.role === ROLES.SECRETARIAT || user.role === ROLES.ADMIN) {
    var newSubs = filtered.filter(function(p){ return p.current_status === STATUS.SUBMITTED; });
    newSubs.forEach(function(p){
      pendingActions.push({ protocol_id: p.protocol_id, title: p.study_title, action: 'Needs Administrative Screening', badge: 'New' });
    });
    var readyAssign = filtered.filter(function(p){ return p.current_status === STATUS.COMPLETE; });
    readyAssign.forEach(function(p){
      pendingActions.push({ protocol_id: p.protocol_id, title: p.study_title, action: 'Needs Reviewer Assignment', badge: 'Action' });
    });
  } else if (user.role === ROLES.CHAIR || user.role === ROLES.VICE_CHAIR) {
    var decisionPending = filtered.filter(function(p){ return p.current_status === STATUS.ASSESSMENT || p.current_status === STATUS.IRERC_DECISION; });
    decisionPending.forEach(function(p){
      pendingActions.push({ protocol_id: p.protocol_id, title: p.study_title, action: 'Awaiting IRERC Decision', badge: 'Decision' });
    });
  } else if (user.role === ROLES.REVIEWER) {
    var myPending = filtered.filter(function(p){ return p.current_status === STATUS.REVIEWER_ASSIGNED || p.current_status === STATUS.UNDER_REVIEW; });
    myPending.forEach(function(p){
      pendingActions.push({ protocol_id: p.protocol_id, title: p.study_title, action: 'Declare COI & Submit Assessment', badge: 'Pending Review' });
    });
  }

  // Only Secretary/Admin see reviewer workload; others get null
  var workloadData = (user.role === ROLES.SECRETARIAT || user.role === ROLES.ADMIN) ? reviewerWorkload : null;

  return apiSuccess_({
    stats: stats,
    charts: {
      by_status: byStatus,
      by_review_type: byReviewType,
      by_month: byMonth,
      by_category: byCategory,
      by_decision: byDecision,
      reviewer_workload: workloadData,
      avg_processing_days: avgProcessingDays,
      pending_actions: pendingActions.slice(0, 10)
    }
  });
}
