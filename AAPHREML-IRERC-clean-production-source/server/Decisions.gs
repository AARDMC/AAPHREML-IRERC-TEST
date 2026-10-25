// ============================================================================
// Decisions.gs — Formal IRERC Decision Recording, Conditions & Ratification
// ============================================================================

/**
 * Records a formal IRERC Committee Decision for a protocol.
 */
function recordFormalDecision_(decisionPayload) {
  var user = requireAuthorizedRole_([ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.SECRETARIAT, ROLES.ADMIN]);

  if (!decisionPayload.protocol_id || !decisionPayload.decision_type) {
    return apiError_('Protocol ID and Decision Type are required.');
  }

  return withTransactionLock_(function() {
    var protocolId = decisionPayload.protocol_id;
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var nowIso = new Date().toISOString();
    var decisionId = 'DEC-' + generateUuid_().substring(0, 8).toUpperCase();

    // Calculate validity period (1 year if approved)
    var validUntil = '';
    if (decisionPayload.decision_type === DECISIONS.APPROVED || decisionPayload.decision_type === DECISIONS.APPROVED_WITH_CONDITIONS) {
      var d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      validUntil = formatDateIso_(d);
    }

    var decisionRecord = {
      decision_id: decisionId,
      protocol_id: protocolId,
      meeting_id: decisionPayload.meeting_id || 'AD_HOC_ACTION',
      decision_type: decisionPayload.decision_type,
      decision_date: nowIso,
      chairperson_id: decisionPayload.chairperson_id || user.user_id,
      chairperson_name: decisionPayload.chairperson_name || user.full_name,
      quorum_members_count: decisionPayload.quorum_count || CFG.QUORUM_MINIMUM_MEMBERS,
      summary_comments: sanitizeString_(decisionPayload.summary_comments || ''),
      conditions_summary: sanitizeString_(decisionPayload.conditions_summary || ''),
      modifications_required: sanitizeString_(decisionPayload.modifications_required || ''),
      approval_letter_doc_id: '',
      valid_from_date: formatDateIso_(new Date()),
      valid_until_date: validUntil,
      communication_date: '',
      status: 'Official',
      created_at: nowIso
    };

    dbInsert_(TABLES.DECISIONS, decisionRecord);

    // Insert itemized conditions if specified
    if (decisionPayload.conditions_list && Array.isArray(decisionPayload.conditions_list)) {
      for (var c = 0; c < decisionPayload.conditions_list.length; c++) {
        var cond = decisionPayload.conditions_list[c];
        dbInsert_(TABLES.DECISION_CONDITIONS, {
          condition_id: 'CND-' + generateUuid_().substring(0, 8).toUpperCase(),
          decision_id: decisionId,
          protocol_id: protocolId,
          condition_type: cond.type || 'Approval Condition',
          description: sanitizeString_(cond.description),
          due_date: cond.due_date || '',
          compliance_status: 'Pending Compliance',
          verified_by: '',
          verified_date: ''
        });
      }
    }

    // Determine target protocol status
    var targetStatus;
    if (decisionPayload.decision_type === DECISIONS.APPROVED) {
      targetStatus = STATUS.APPROVED;
    } else if (decisionPayload.decision_type === DECISIONS.APPROVED_WITH_CONDITIONS) {
      targetStatus = STATUS.APPROVED_WITH_CONDITIONS;
    } else if (decisionPayload.decision_type === DECISIONS.MODIFICATIONS_REQUIRED) {
      targetStatus = STATUS.MODIFICATIONS_REQUIRED;
    } else if (decisionPayload.decision_type === DECISIONS.RETURNED_FOR_CORRECTION) {
      targetStatus = STATUS.CORRECTION_REQUIRED;
    } else if (decisionPayload.decision_type === DECISIONS.DEFERRED) {
      targetStatus = STATUS.ASSESSMENT;
    } else {
      targetStatus = STATUS.NOT_APPROVED;
    }

    var updates = {
      current_status: targetStatus,
      current_stage: 'IRERC Decision: ' + decisionPayload.decision_type,
      updated_at: nowIso
    };
    if (targetStatus === STATUS.APPROVED || targetStatus === STATUS.APPROVED_WITH_CONDITIONS) {
      updates.approval_date = nowIso;
      updates.expiry_date = validUntil;
    }
    dbUpdate_(TABLES.PROTOCOLS, protocolId, updates);

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'IRERC_DECISION_RECORDED',
      p.current_status,
      targetStatus,
      'Decision: ' + decisionPayload.decision_type + ' recorded by ' + user.full_name + '. Notes: ' + decisionPayload.summary_comments
    );

    createNotification_(
      p.pi_id,
      p.pi_email,
      protocolId,
      'IRERC Decision Recorded: ' + protocolId,
      'A formal IRERC decision has been recorded for your protocol ' + protocolId + ': ' + decisionPayload.decision_type + '.',
      'DECISION'
    );

    return apiSuccess_(decisionRecord, 'IRERC Decision successfully recorded.');
  });
}

/**
 * Marks condition compliance verified by Secretariat or Chair.
 */
function verifyConditionCompliance_(conditionId, notes) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var cond = dbFindById_(TABLES.DECISION_CONDITIONS, conditionId);
    if (!cond) return apiError_('Condition not found: ' + conditionId);

    var nowIso = new Date().toISOString();
    var updated = dbUpdate_(TABLES.DECISION_CONDITIONS, conditionId, {
      compliance_status: 'Complied & Verified',
      verified_by: user.full_name,
      verified_date: nowIso
    });

    logAuditEvent_(
      cond.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'CONDITION_VERIFIED',
      'Pending',
      'Complied',
      'Verified condition: ' + cond.description + ' (' + (notes || '') + ')'
    );

    return apiSuccess_(updated, 'Condition compliance verified.');
  });
}
