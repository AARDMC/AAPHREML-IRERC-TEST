// ============================================================================
// Screening.gs — Administrative Screening, Completeness Verification & Intake
// ============================================================================

/**
 * Step 1: Secretariat receives submitted package and initiates administrative screening.
 */
function markProtocolReceived_(protocolId) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var updated = dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      current_status: STATUS.ADMINISTRATIVE_CHECK,
      current_stage: 'Administrative Screening in Progress',
      administrative_officer: user.full_name,
      updated_at: new Date().toISOString()
    });

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'PACKAGE_RECEIVED',
      p.current_status,
      STATUS.ADMINISTRATIVE_CHECK,
      'Package received and logged by Secretariat: ' + user.full_name
    );

    return apiSuccess_(updated, 'Protocol package marked as received by Secretariat.');
  });
}

/**
 * Step 2: Administrative completeness check of documents and application items.
 * Evaluates document slots, sets individual item statuses, and decides completeness.
 */
function performAdministrativeCheck_(protocolId, checkResults, generalNotes) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var hasIncomplete = false;
    var incompleteReasons = [];

    // Process document-level verification results
    if (checkResults && Array.isArray(checkResults)) {
      for (var i = 0; i < checkResults.length; i++) {
        var item = checkResults[i];
        if (item.doc_id) {
          dbUpdate_(TABLES.PROTOCOL_DOCUMENTS, item.doc_id, {
            status: item.status || DOC_STATUS.VERIFIED,
            verification_notes: item.notes || '',
            verified_by: user.full_name,
            updated_at: new Date().toISOString()
          });

          if (item.status === DOC_STATUS.REQUIRES_CORRECTION || item.status === DOC_STATUS.MISSING) {
            hasIncomplete = true;
            incompleteReasons.push(item.document_title + ': ' + (item.notes || 'Incomplete / Missing'));
          }
        }
      }
    }

    var nowIso = new Date().toISOString();

    if (hasIncomplete) {
      // Transition to CORRECTION_REQUIRED
      dbUpdate_(TABLES.PROTOCOLS, protocolId, {
        current_status: STATUS.CORRECTION_REQUIRED,
        current_stage: 'Investigator Corrections Required',
        updated_at: nowIso
      });

      logAuditEvent_(
        protocolId,
        user.user_id,
        user.full_name,
        user.role,
        'ADMIN_CHECK_FAILED',
        p.current_status,
        STATUS.CORRECTION_REQUIRED,
        'Administrative check identified missing/incomplete items: ' + incompleteReasons.join('; ')
      );

      // Dispatch communication & notification to PI
      createNotification_(
        p.pi_id,
        p.pi_email,
        protocolId,
        'Protocol Incomplete - Action Required: ' + protocolId,
        'Your protocol submission ' + protocolId + ' requires administrative corrections before review. Details: ' + incompleteReasons.join('; '),
        'CORRECTION'
      );

      recordCommunication_({
        protocol_id: protocolId,
        comm_type: 'Correction Request',
        recipient_email: p.pi_email,
        recipient_name: p.pi_name,
        subject: 'AAPHREML-IRERC: Incomplete Submission for ' + protocolId,
        message_body: 'Dear ' + p.pi_name + ',\n\nDuring administrative screening of protocol ' + protocolId + ', the following issues were noted:\n\n' + incompleteReasons.join('\n') + '\n\nGeneral Notes: ' + (generalNotes || 'None') + '\n\nPlease log in to the portal and upload the required revisions.\n\nAAPHREML-IRERC Secretariat',
        delivery_status: 'Sent'
      });

      return apiSuccess_({
        protocol_id: protocolId,
        status: STATUS.CORRECTION_REQUIRED,
        message: 'Submission marked as Incomplete. Correction notice dispatched to PI.'
      });

    } else {
      // Step 3 & 4: Complete the submission process & store package
      dbUpdate_(TABLES.PROTOCOLS, protocolId, {
        current_status: STATUS.COMPLETE,
        current_stage: 'Submission Complete - Ready for Review Type Classification',
        updated_at: nowIso
      });

      logAuditEvent_(
        protocolId,
        user.user_id,
        user.full_name,
        user.role,
        'ADMIN_CHECK_PASSED',
        p.current_status,
        STATUS.COMPLETE,
        'Administrative check passed. Package stored and registered for classification.'
      );

      createNotification_(
        'CHAIR',
        '',
        protocolId,
        'Protocol Verified: ' + protocolId,
        'Protocol ' + protocolId + ' has passed administrative checking and is awaiting review type classification.',
        'VERIFIED'
      );

      return apiSuccess_({
        protocol_id: protocolId,
        status: STATUS.COMPLETE,
        message: 'Submission completeness verified. Ready for review type classification.'
      });
    }
  });
}

/**
 * REQ-3: Secretariat formally assigns the Review Type (Full Board / Expedited / Exemption).
 * This is the official classification decision — it overrides the auto-suggestion from submission.
 */
function classifyReviewType_(protocolId, reviewType, justification) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  var validTypes = [REVIEW_TYPES.FULL_BOARD, REVIEW_TYPES.EXPEDITED, REVIEW_TYPES.EXEMPTION];
  if (validTypes.indexOf(reviewType) === -1) {
    return apiError_('Invalid review type. Must be one of: ' + validTypes.join(', '));
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    var allowedStatuses = [STATUS.COMPLETE, 'Submission Complete', 'Administratively Complete',
                           STATUS.REVIEW_TYPE_CLASSIFICATION, STATUS.REVIEWER_ASSIGNED, 'Under Review Type Classification', 'Reviewer Assigned'];
    if (allowedStatuses.indexOf(p.current_status) === -1) {
      return apiError_('Review type can only be assigned after the administrative check is passed. Current status: ' + p.current_status);
    }

    var nowIso = new Date().toISOString();

    dbUpdate_(TABLES.PROTOCOLS, protocolId, {
      review_type:    reviewType,
      current_status: STATUS.REVIEW_TYPE_CLASSIFICATION,
      current_stage:  'Review Type Classified: ' + reviewType,
      updated_at:     nowIso
    });

    // Notify PI of the review pathway assigned
    createNotification_(p.pi_id || '', p.pi_email, protocolId,
      'Review Type Assigned: ' + protocolId,
      'Your protocol has been classified for ' + reviewType + ' by the IRERC Secretariat. ' +
      'A reviewer will be assigned shortly.',
      'SCREENING');

    logAuditEvent_(protocolId, user.user_id, user.full_name, user.role,
      'REVIEW_TYPE_CLASSIFIED', p.review_type || 'Unclassified', reviewType,
      'Review type formally assigned as "' + reviewType + '" by ' + user.full_name +
      (justification ? '. Justification: ' + justification : ''));

    return apiSuccess_({ protocolId: protocolId, reviewType: reviewType },
      'Protocol ' + protocolId + ' classified for ' + reviewType + '.');
  });
}
