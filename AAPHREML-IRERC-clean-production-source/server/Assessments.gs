// ============================================================================
// Assessments.gs — Digital Study Assessment Forms & Evaluation Engine
// ============================================================================

/**
 * Step 1: Secretariat initializes or prepares the Study Assessment Form for a protocol.
 */
function prepareAssessmentForm_(protocolId, reviewerId) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN, ROLES.REVIEWER]);

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    // Check if an assessment form already exists for this reviewer
    var existingForms = dbFind_(TABLES.ASSESSMENT_FORMS, function(f) {
      return f.protocol_id === protocolId && f.reviewer_id === reviewerId;
    });

    if (existingForms.length > 0) {
      var form = existingForms[0];
      var items = dbFind_(TABLES.ASSESSMENT_ITEMS, function(it) {
        return it.assessment_id === form.assessment_id;
      });
      return apiSuccess_({
        assessment_form: form,
        items: items
      });
    }

    var nowIso = new Date().toISOString();
    var assessmentId = 'ASM-' + generateUuid_().substring(0, 8).toUpperCase();

    var newForm = {
      assessment_id: assessmentId,
      protocol_id: protocolId,
      reviewer_id: reviewerId,
      assignment_id: '',
      assessment_date: formatDateIso_(new Date()),
      summary_notes: '',
      investigator_verdict: 'Pending Review',
      site_verdict: 'Pending Review',
      participation_verdict: 'Pending Review',
      community_verdict: 'Pending Review',
      recommendation: 'Pending',
      required_corrections: '',
      signature_approval: '',
      status: 'Draft',
      submitted_at: ''
    };

    dbInsert_(TABLES.ASSESSMENT_FORMS, newForm);

    // Populate standard 20 assessment criteria items
    var seededItems = [];
    for (var i = 0; i < STANDARD_ASSESSMENT_ITEMS.length; i++) {
      var crit = STANDARD_ASSESSMENT_ITEMS[i];
      var item = {
        item_id: 'ITM-' + generateUuid_().substring(0, 8).toUpperCase(),
        assessment_id: assessmentId,
        protocol_id: protocolId,
        reviewer_id: reviewerId,
        criteria_code: crit.code,
        section_name: crit.section,
        criteria_question: crit.question,
        finding: 'Satisfactory',
        reviewer_comment: '',
        required_correction: '',
        created_at: nowIso
      };
      dbInsert_(TABLES.ASSESSMENT_ITEMS, item);
      seededItems.push(item);
    }

    return apiSuccess_({
      assessment_form: newForm,
      items: seededItems
    }, 'Assessment form initialized with standard 20-point ethics criteria.');
  });
}

/**
 * Step 2 to 5: Reviewer submits completed Study Assessment Form.
 */
function submitCompletedAssessment_(assessmentPayload) {
  var user = requireAuthorizedRole_([ROLES.REVIEWER, ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.ADMIN]);

  if (!assessmentPayload.assessment_id || !assessmentPayload.protocol_id) {
    return apiError_('Assessment ID and Protocol ID are required.');
  }
  if (!assessmentPayload.recommendation || assessmentPayload.recommendation === 'Pending') {
    return apiError_('A formal reviewer recommendation must be selected.');
  }
  if (!assessmentPayload.signature_approval || assessmentPayload.signature_approval.trim() === '') {
    return apiError_('Digital reviewer signature / approval confirmation is required.');
  }

  return withTransactionLock_(function() {
    var form = dbFindById_(TABLES.ASSESSMENT_FORMS, assessmentPayload.assessment_id);
    if (!form) return apiError_('Assessment form not found.');

    var nowIso = new Date().toISOString();

    // 1. Update individual assessment items
    if (assessmentPayload.items && Array.isArray(assessmentPayload.items)) {
      for (var i = 0; i < assessmentPayload.items.length; i++) {
        var itm = assessmentPayload.items[i];
        if (itm.item_id) {
          dbUpdate_(TABLES.ASSESSMENT_ITEMS, itm.item_id, {
            finding: itm.finding || 'Satisfactory',
            reviewer_comment: sanitizeString_(itm.reviewer_comment || ''),
            required_correction: sanitizeString_(itm.required_correction || '')
          });
        }
      }
    }

    // 2. Update parent assessment form
    var updatedForm = dbUpdate_(TABLES.ASSESSMENT_FORMS, form.assessment_id, {
      assessment_date: formatDateIso_(new Date()),
      summary_notes: sanitizeString_(assessmentPayload.summary_notes || ''),
      investigator_verdict: assessmentPayload.investigator_verdict || 'Satisfactory',
      site_verdict: assessmentPayload.site_verdict || 'Satisfactory',
      participation_verdict: assessmentPayload.participation_verdict || 'Satisfactory',
      community_verdict: assessmentPayload.community_verdict || 'Satisfactory',
      recommendation: assessmentPayload.recommendation,
      required_corrections: sanitizeString_(assessmentPayload.required_corrections || ''),
      signature_approval: sanitizeString_(assessmentPayload.signature_approval),
      status: 'Submitted',
      submitted_at: nowIso
    });

    // 3. Mark Reviewer Assignment Completed
    var assignments = dbFind_(TABLES.REVIEWER_ASSIGNMENTS, function(a) {
      return a.protocol_id === form.protocol_id && (a.reviewer_id === form.reviewer_id || String(a.reviewer_email).toLowerCase() === String(user.email).toLowerCase());
    });
    if (assignments.length > 0) {
      dbUpdate_(TABLES.REVIEWER_ASSIGNMENTS, assignments[0].assignment_id, {
        status: 'Completed',
        completed_date: nowIso
      });
    }

    // 4. Update Protocol Status to ASSESSMENT
    var p = dbFindById_(TABLES.PROTOCOLS, form.protocol_id);
    if (p) {
      dbUpdate_(TABLES.PROTOCOLS, form.protocol_id, {
        current_status: STATUS.ASSESSMENT,
        current_stage: 'Study Assessment Completed - Awaiting IRERC Decision',
        updated_at: nowIso
      });
    }

    logAuditEvent_(
      form.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'ASSESSMENT_SUBMITTED',
      STATUS.UNDER_REVIEW,
      STATUS.ASSESSMENT,
      'Reviewer ' + user.full_name + ' submitted study assessment. Recommendation: ' + assessmentPayload.recommendation
    );

    createNotification_(
      'SECRETARIAT',
      '',
      form.protocol_id,
      'Study Assessment Completed: ' + form.protocol_id,
      'Reviewer ' + user.full_name + ' completed assessment for ' + form.protocol_id + ' (' + assessmentPayload.recommendation + '). Ready for meeting deliberation.',
      'DECISION'
    );

    return apiSuccess_(updatedForm, 'Study assessment successfully completed and submitted to Secretariat.');
  });
}

/**
 * Step 7: Gather all Assessment Reports for a protocol (Secretariat / Chair).
 */
function getGatheredAssessmentReports_(protocolId) {
  requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.ADMIN]);

  var forms = dbFind_(TABLES.ASSESSMENT_FORMS, function(f) {
    return f.protocol_id === protocolId;
  });

  var allItems = dbFind_(TABLES.ASSESSMENT_ITEMS, function(it) {
    return it.protocol_id === protocolId;
  });

  var aggregated = forms.map(function(f) {
    var itemsForForm = allItems.filter(function(it) {
      return it.assessment_id === f.assessment_id;
    });
    return {
      form: f,
      items: itemsForForm
    };
  });

  return apiSuccess_(aggregated);
}
