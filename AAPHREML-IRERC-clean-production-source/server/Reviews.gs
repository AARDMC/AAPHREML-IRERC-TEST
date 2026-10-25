// ============================================================================
// Reviews.gs — Reviewer Assignment, Workload, Conflict of Interest & Assessments
// ============================================================================

/**
 * Retrieves reviewer workload analytics (active assigned protocols per reviewer).
 */
function getReviewerWorkload_() {
  requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN]);

  var members = dbFind_(TABLES.COMMITTEE_MEMBERS, function(m) {
    return m.is_active && (m.committee_role === ROLES.REVIEWER || m.committee_role === ROLES.CHAIR || m.committee_role === ROLES.VICE_CHAIR);
  });

  var activeAssignments = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
    return a.status === 'Assigned' || a.status === 'In Progress';
  });

  var workload = members.map(function(m) {
    var count = activeAssignments.filter(function(a) {
      return a.reviewer_id === m.member_id || String(a.reviewer_email).toLowerCase() === String(m.email).toLowerCase();
    }).length;

    return {
      member_id: m.member_id,
      full_name: m.full_name,
      email: m.email,
      professional_category: m.professional_category,
      committee_role: m.committee_role,
      active_assignments_count: count,
      coi_status: m.coi_status
    };
  });

  return apiSuccess_(workload);
}

/**
 * Assigns one or more committee members/reviewers to a protocol.
 */
function assignReviewersToProtocol_(protocolId, reviewerList, deadlineDays, notes) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN]);

  if (!protocolId) return apiError_('Protocol ID is required.');
  if (!reviewerList || !Array.isArray(reviewerList) || reviewerList.length === 0) {
    return apiError_('Please select at least one reviewer.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var days = deadlineDays ? parseInt(deadlineDays, 10) : CFG.REVIEW_DEADLINE_DAYS;
    var deadlineIso = calculateWorkingDaysDeadline_(new Date(), days);
    var nowIso = new Date().toISOString();
    var assignedNames = [];

    for (var i = 0; i < reviewerList.length; i++) {
      var rev = reviewerList[i]; // { member_id, email, full_name }
      var assignmentId = 'ASGN-' + generateUuid_().substring(0, 8).toUpperCase();

      var assignment = {
        assignment_id: assignmentId,
        protocol_id: protocolId,
        reviewer_id: rev.member_id || rev.reviewer_id,
        reviewer_name: rev.full_name,
        reviewer_email: rev.email.trim().toLowerCase(),
        assigned_by: user.full_name,
        assigned_date: nowIso,
        deadline_date: deadlineIso,
        coi_declared: 'Pending',
        coi_declared_date: '',
        coi_notes: '',
        status: 'Assigned',
        completed_date: '',
        notes: notes || '',
        created_at: nowIso
      };

      dbInsert_(TABLES.REVIEWER_ASSIGNMENTS, assignment);
      assignedNames.push(rev.full_name);

      // Dispatch notification to Reviewer
      createNotification_(
        rev.member_id,
        rev.email,
        protocolId,
        'Protocol Assigned for Review: ' + protocolId,
        'You have been assigned to review protocol "' + p.study_title + '". Review deadline: ' + formatDateIso_(deadlineIso) + '. Please declare COI and commence review.',
        'ASSIGNMENT'
      );
    }

    // Update Protocol Stage and Lead Reviewer if not already set
    var updates = {
      current_status: STATUS.REVIEWER_ASSIGNED,
      current_stage: 'Assigned to Reviewers (' + assignedNames.join(', ') + ')',
      updated_at: nowIso
    };
    if (!p.lead_reviewer_id && reviewerList.length > 0) {
      updates.lead_reviewer_id = reviewerList[0].member_id;
      updates.lead_reviewer_name = reviewerList[0].full_name;
    }
    dbUpdate_(TABLES.PROTOCOLS, protocolId, updates);

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'REVIEWERS_ASSIGNED',
      p.current_status,
      STATUS.REVIEWER_ASSIGNED,
      'Assigned reviewers: ' + assignedNames.join(', ') + ' with deadline ' + formatDateIso_(deadlineIso)
    );

    return apiSuccess_({
      protocol_id: protocolId,
      assigned_reviewers: assignedNames,
      deadline: deadlineIso
    }, 'Reviewers successfully assigned.');
  });
}

/**
 * Reassigns or cancels a reviewer assignment.
 */
function reassignReviewer_(assignmentId, newReviewer, reason) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var oldAssign = dbFindById_(TABLES.REVIEWER_ASSIGNMENTS, assignmentId);
    if (!oldAssign) return apiError_('Assignment not found.');

    // Mark previous assignment cancelled/reassigned
    dbUpdate_(TABLES.REVIEWER_ASSIGNMENTS, assignmentId, {
      status: 'Reassigned',
      notes: (oldAssign.notes ? oldAssign.notes + ' | ' : '') + 'Reassigned: ' + (reason || 'No reason provided')
    });

    // Create new assignment
    var days = CFG.REVIEW_DEADLINE_DAYS;
    var deadlineIso = calculateWorkingDaysDeadline_(new Date(), days);
    var nowIso = new Date().toISOString();
    var newAssignId = 'ASGN-' + generateUuid_().substring(0, 8).toUpperCase();

    var newAssignment = {
      assignment_id: newAssignId,
      protocol_id: oldAssign.protocol_id,
      reviewer_id: newReviewer.member_id,
      reviewer_name: newReviewer.full_name,
      reviewer_email: newReviewer.email.trim().toLowerCase(),
      assigned_by: user.full_name,
      assigned_date: nowIso,
      deadline_date: deadlineIso,
      coi_declared: 'Pending',
      coi_declared_date: '',
      coi_notes: '',
      status: 'Assigned',
      completed_date: '',
      notes: 'Reassigned in place of ' + oldAssign.reviewer_name + ': ' + reason,
      created_at: nowIso
    };

    dbInsert_(TABLES.REVIEWER_ASSIGNMENTS, newAssignment);

    logAuditEvent_(
      oldAssign.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'REVIEWER_REASSIGNED',
      '',
      '',
      'Reassigned from ' + oldAssign.reviewer_name + ' to ' + newReviewer.full_name + ' (' + reason + ')'
    );

    return apiSuccess_(newAssignment, 'Reviewer successfully reassigned.');
  });
}

/**
 * Step 2 & 3: Reviewer Conflict of Interest Declaration and Package Verification.
 * Mandatory check before reviewer can access full protocol details or complete assessment.
 */
function declareReviewerCoi_(assignmentId, hasConflict, coiDetails) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required.');

  return withTransactionLock_(function() {
    var assign = dbFindById_(TABLES.REVIEWER_ASSIGNMENTS, assignmentId);
    if (!assign) return apiError_('Assignment not found.');

    // Verify reviewer ownership
    if (user.role !== ROLES.ADMIN && assign.reviewer_email.toLowerCase() !== user.email.toLowerCase() && assign.reviewer_id !== user.user_id) {
      throw new Error('Access denied: You can only declare COI for your own assignments.');
    }

    var nowIso = new Date().toISOString();

    if (hasConflict === true || hasConflict === 'Yes') {
      // Reviewer has COI: Mark assignment conflicted/recused
      dbUpdate_(TABLES.REVIEWER_ASSIGNMENTS, assignmentId, {
        coi_declared: 'Conflict Declared (Recused)',
        coi_declared_date: nowIso,
        coi_notes: coiDetails || 'Conflict of interest declared by reviewer.',
        status: 'Recused - COI'
      });

      logAuditEvent_(
        assign.protocol_id,
        user.user_id,
        user.full_name,
        user.role,
        'COI_RECUSAL',
        '',
        '',
        'Reviewer ' + user.full_name + ' declared conflict of interest: ' + coiDetails
      );

      createNotification_(
        'SECRETARIAT',
        '',
        assign.protocol_id,
        'Reviewer COI Declared: ' + assign.protocol_id,
        'Reviewer ' + user.full_name + ' declared a conflict of interest on protocol ' + assign.protocol_id + '. Reassignment required.',
        'ALERT'
      );

      return apiSuccess_({
        recused: true,
        message: 'Conflict of interest recorded. You have been recused from reviewing this protocol. Thank you for declaring.'
      });

    } else {
      // No COI: Clear reviewer to commence review
      dbUpdate_(TABLES.REVIEWER_ASSIGNMENTS, assignmentId, {
        coi_declared: 'None Declared (Cleared)',
        coi_declared_date: nowIso,
        coi_notes: coiDetails || 'No conflict of interest declared.',
        status: 'In Progress'
      });

      // Update protocol status to UNDER_REVIEW
      var p = dbFindById_(TABLES.PROTOCOLS, assign.protocol_id);
      if (p && p.current_status === STATUS.REVIEWER_ASSIGNED) {
        dbUpdate_(TABLES.PROTOCOLS, assign.protocol_id, {
          current_status: STATUS.UNDER_REVIEW,
          current_stage: 'Under Review by Assigned Members',
          updated_at: nowIso
        });
      }

      logAuditEvent_(
        assign.protocol_id,
        user.user_id,
        user.full_name,
        user.role,
        'COI_CLEARED',
        '',
        '',
        'Reviewer ' + user.full_name + ' confirmed no conflict of interest. Package verified.'
      );

      return apiSuccess_({
        recused: false,
        message: 'Conflict of interest clearance recorded. Protocol package ready for review.'
      });
    }
  });
}
