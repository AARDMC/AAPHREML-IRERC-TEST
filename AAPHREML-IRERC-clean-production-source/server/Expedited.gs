// ============================================================================
// Expedited.gs — Expedited Review Determination, Consultation & Process
// ============================================================================

/**
 * Step 2: Secretary/Administrator determines expedited eligibility in consultation with Chairperson/Vice Chair.
 * NOTE: The system strictly does NOT automatically classify; an authorized officer must explicitly decide and record consultation.
 */
function recordExpeditedClassification_(protocolId, payload) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.ADMIN]);

  if (!protocolId) return apiError_('Protocol ID is required.');
  if (!payload.justification || payload.justification.trim() === '') {
    return apiError_('Justification for expedited review is required.');
  }
  if (!payload.consulted_chair_name || payload.consulted_chair_name.trim() === '') {
    return apiError_('Consultation with Chairperson or Vice Chairperson must be documented.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var nowIso = new Date().toISOString();
    var expeditedId = 'EXP-' + generateUuid_().substring(0, 8).toUpperCase();

    var record = {
      expedited_id: expeditedId,
      protocol_id: protocolId,
      classified_by: user.full_name + ' (' + user.role + ')',
      classification_date: nowIso,
      eligibility_category: payload.eligibility_category || 'Minimal Risk / Non-Interventional',
      justification: sanitizeString_(payload.justification),
      consulted_chair_id: payload.consulted_chair_name,
      consultation_date: payload.consultation_date || formatDateIso_(new Date()),
      chair_concurrence: payload.chair_concurrence || 'Concurred (Eligible for Expedited Review)',
      assigned_reviewer_id: payload.assigned_reviewer_id || '',
      review_date: '',
      decision: 'Pending Expedited Review',
      communication_date: '',
      created_at: nowIso
    };

    var existing = dbFind_(TABLES.EXPEDITED_DETERMINATIONS, function(ed) {
      return ed.protocol_id === protocolId;
    });

    if (existing.length > 0) {
      dbUpdate_(TABLES.EXPEDITED_DETERMINATIONS, existing[0].expedited_id, record);
    } else {
      dbInsert_(TABLES.EXPEDITED_DETERMINATIONS, record);
    }

    // Update main protocol record review type
    dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      review_type: REVIEW_TYPES.EXPEDITED,
      current_status: STATUS.REVIEWER_ASSIGNED,
      current_stage: 'Expedited Review in Progress',
      updated_at: nowIso
    });

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'EXPEDITED_CLASSIFICATION',
      p.review_type,
      REVIEW_TYPES.EXPEDITED,
      'Classified for Expedited Review by ' + user.full_name + ' in consultation with ' + payload.consulted_chair_name + '. Justification: ' + payload.justification
    );

    return apiSuccess_(record, 'Expedited review determination successfully recorded.');
  });
}

/**
 * Step 3: Chairperson / Designated Reviewer completes expedited review and makes determination.
 */
function submitExpeditedReviewDecision_(protocolId, decisionPayload) {
  var user = requireAuthorizedRole_([ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.REVIEWER, ROLES.ADMIN]);

  if (!protocolId) return apiError_('Protocol ID is required.');
  if (!decisionPayload.decision) return apiError_('Decision outcome is required.');

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var existingExpedited = dbFind_(TABLES.EXPEDITED_DETERMINATIONS, function(ed) {
      return ed.protocol_id === protocolId;
    });

    var nowIso = new Date().toISOString();

    if (existingExpedited.length > 0) {
      dbUpdate_(TABLES.EXPEDITED_DETERMINATIONS, existingExpedited[0].expedited_id, {
        assigned_reviewer_id: user.full_name,
        review_date: formatDateIso_(new Date()),
        decision: decisionPayload.decision,
        communication_date: nowIso
      });
    }

    // Create formal decision record
    var decisionId = 'DEC-' + generateUuid_().substring(0, 8).toUpperCase();
    var validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + 1); // 1 year approval standard

    var formalDecision = {
      decision_id: decisionId,
      protocol_id: protocolId,
      meeting_id: 'EXPEDITED_ACTION',
      decision_type: decisionPayload.decision,
      decision_date: nowIso,
      chairperson_id: user.user_id,
      chairperson_name: user.full_name,
      quorum_members_count: 1, // Expedited review designated member
      summary_comments: sanitizeString_(decisionPayload.summary_comments || ''),
      conditions_summary: sanitizeString_(decisionPayload.conditions || ''),
      modifications_required: sanitizeString_(decisionPayload.modifications_required || ''),
      approval_letter_doc_id: '',
      valid_from_date: formatDateIso_(new Date()),
      valid_until_date: formatDateIso_(validUntil),
      communication_date: nowIso,
      status: 'Official',
      created_at: nowIso
    };

    dbInsert_(TABLES.DECISIONS, formalDecision);

    // Update Protocol Status
    var targetStatus = decisionPayload.decision === DECISIONS.APPROVED ? STATUS.APPROVED :
                       decisionPayload.decision === DECISIONS.APPROVED_WITH_CONDITIONS ? STATUS.APPROVED_WITH_CONDITIONS :
                       decisionPayload.decision === DECISIONS.MODIFICATIONS_REQUIRED ? STATUS.MODIFICATIONS_REQUIRED : STATUS.NOT_APPROVED;

    dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      current_status: targetStatus,
      current_stage: 'Expedited Decision: ' + decisionPayload.decision,
      approval_date: (decisionPayload.decision === DECISIONS.APPROVED || decisionPayload.decision === DECISIONS.APPROVED_WITH_CONDITIONS) ? nowIso : '',
      expiry_date: (decisionPayload.decision === DECISIONS.APPROVED || decisionPayload.decision === DECISIONS.APPROVED_WITH_CONDITIONS) ? formatDateIso_(validUntil) : '',
      updated_at: nowIso
    });

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'EXPEDITED_DECISION_ISSUED',
      p.current_status,
      targetStatus,
      'Expedited Decision rendered by ' + user.full_name + ': ' + decisionPayload.decision
    );

    // Step 4: Communicate with IRERC and Investigator
    createNotification_(
      p.pi_id,
      p.pi_email,
      protocolId,
      'Expedited Review Decision: ' + protocolId,
      'Your protocol ' + protocolId + ' has completed expedited review. Decision: ' + decisionPayload.decision + '.',
      'DECISION'
    );

    createNotification_(
      'COMMITTEE',
      '',
      protocolId,
      'Expedited Protocol Ratification Notice: ' + protocolId,
      'Protocol ' + protocolId + ' approved via expedited review by ' + user.full_name + '. Added to upcoming IRERC docket for committee ratification.',
      'RATIFICATION'
    );

    return apiSuccess_(formalDecision, 'Expedited review completed and decision logged successfully.');
  });
}
