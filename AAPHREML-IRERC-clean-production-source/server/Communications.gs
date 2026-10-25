// ============================================================================
// Communications.gs — Official Correspondence, Gmail Dispatch & Notifications
// ============================================================================

/**
 * Records a communication log entry and optionally dispatches via Gmail/MailApp.
 */
function recordCommunication_(commPayload) {
  var user = getSessionUser_();
  var senderEmail = user ? user.email : 'irerc.secretariat@aahb.gov.et';
  var nowIso = new Date().toISOString();
  var commId = 'COM-' + generateUuid_().substring(0, 8).toUpperCase();

  var deliveryStatus = 'Logged';

  // Try sending actual email notification if recipient email is valid
  if (commPayload.recipient_email && isValidEmail_(commPayload.recipient_email)) {
    try {
      MailApp.sendEmail({
        to: commPayload.recipient_email,
        subject: commPayload.subject,
        body: commPayload.message_body + '\n\n---\nAddis Ababa City Administration Health Bureau Institutional Research Ethics Review Committee (AAPHREML-IRERC)\nWebsite: https://aahb.gov.et'
      });
      deliveryStatus = 'Sent via Email';
    } catch (e) {
      deliveryStatus = 'Logged (Email service deferred: ' + e.message + ')';
    }
  }

  var record = {
    comm_id: commId,
    protocol_id: commPayload.protocol_id || 'GENERAL',
    comm_type: commPayload.comm_type || 'General Notice',
    recipient_email: commPayload.recipient_email || '',
    recipient_name: commPayload.recipient_name || '',
    sender_email: senderEmail,
    sent_at: nowIso,
    subject: sanitizeString_(commPayload.subject || ''),
    message_body: sanitizeString_(commPayload.message_body || ''),
    attached_doc_ids: commPayload.attached_doc_ids || '',
    delivery_status: deliveryStatus,
    created_at: nowIso
  };

  dbInsert_(TABLES.COMMUNICATIONS, record);
  return record;
}

/**
 * Communicates official IRERC Preliminary or Final Decision to Investigator.
 */
function sendDecisionCommunication_(payload) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  if (!payload.protocol_id || !payload.decision_id) {
    return apiError_('Protocol ID and Decision ID are required.');
  }

  return withTransactionLock_(function() {
    var p = dbFindById_(TABLES.PROTOCOLS, payload.protocol_id);
    if (!p) return apiError_('Protocol not found: ' + payload.protocol_id);

    var dec = dbFindById_(TABLES.DECISIONS, payload.decision_id);
    if (!dec) return apiError_('Decision record not found: ' + payload.decision_id);

    var nowIso = new Date().toISOString();
    var commType = payload.is_preliminary ? 'Preliminary Decision' : 'Final Decision';

    var subject = 'AAPHREML-IRERC: ' + commType + ' for Protocol ' + payload.protocol_id;
    var body = 'Dear ' + p.pi_name + ',\n\n' +
      'The Addis Ababa City Administration Health Bureau Institutional Research Ethics Review Committee (AAPHREML-IRERC) has concluded the review of your research protocol:\n\n' +
      'Protocol ID: ' + p.protocol_id + '\n' +
      'Study Title: ' + p.study_title + '\n' +
      'Outcome: ' + dec.decision_type + '\n' +
      'Date: ' + formatDateIso_(dec.decision_date) + '\n\n' +
      (dec.conditions_summary ? 'Conditions / Directives:\n' + dec.conditions_summary + '\n\n' : '') +
      (dec.modifications_required ? 'Required Modifications:\n' + dec.modifications_required + '\n\n' : '') +
      'Message from Secretariat:\n' + (payload.custom_message || 'Please log in to the portal for official documentation.') + '\n\n' +
      'Sincerely,\n' +
      'AAPHREML-IRERC Secretariat\n' +
      'Addis Ababa City Administration Health Bureau';

    var commRecord = recordCommunication_({
      protocol_id: payload.protocol_id,
      comm_type: commType,
      recipient_email: p.pi_email,
      recipient_name: p.pi_name,
      subject: subject,
      message_body: body,
      delivery_status: 'Sent'
    });

    // Update decision record communication date
    dbUpdate_(TABLES.DECISIONS, payload.decision_id, {
      communication_date: nowIso
    });

    // Transition protocol state to COMMUNICATED
    dbUpdate_(TABLES.PROTOCOLS, payload.protocol_id, {
      current_status: STATUS.COMMUNICATED,
      current_stage: commType + ' Communicated to PI',
      updated_at: nowIso
    });

    logAuditEvent_(
      payload.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'DECISION_COMMUNICATED',
      p.current_status,
      STATUS.COMMUNICATED,
      commType + ' dispatched to ' + p.pi_email + ' (' + dec.decision_type + ')'
    );

    createNotification_(
      p.pi_id,
      p.pi_email,
      payload.protocol_id,
      commType + ': ' + payload.protocol_id,
      'Your official ' + commType.toLowerCase() + ' (' + dec.decision_type + ') has been communicated.',
      'DECISION'
    );

    return apiSuccess_(commRecord, commType + ' successfully communicated to Principal Investigator.');
  });
}

/**
 * Creates an in-app notification.
 */
function createNotification_(userId, userEmail, protocolId, title, message, type) {
  try {
    var notifId = 'NOTIF-' + generateUuid_().substring(0, 8).toUpperCase();
    var record = {
      notification_id: notifId,
      user_id: userId || '',
      user_email: userEmail || '',
      protocol_id: protocolId || '',
      title: sanitizeString_(title),
      message: sanitizeString_(message),
      type: type || 'INFO',
      is_read: false,
      created_at: new Date().toISOString()
    };
    dbInsert_(TABLES.NOTIFICATIONS, record);
    return record;
  } catch (e) {
    Logger.log('Error creating notification: ' + e.message);
  }
}

/**
 * Retrieves unread notifications for current user.
 */
function getMyNotifications_() {
  var user = getSessionUser_();
  if (!user) return apiSuccess_([]);

  var notifs = dbFind_(TABLES.NOTIFICATIONS, function(n) {
    var matchUser = n.user_id === user.user_id || String(n.user_email).toLowerCase() === String(user.email).toLowerCase();
    var matchRole = false;
    if (user.role === ROLES.SECRETARIAT && n.user_id === 'SECRETARIAT') matchRole = true;
    if (user.role === ROLES.CHAIR && n.user_id === 'CHAIR') matchRole = true;
    if ((user.role === ROLES.REVIEWER || user.role === ROLES.CHAIR) && n.user_id === 'COMMITTEE') matchRole = true;
    return matchUser || matchRole;
  });

  notifs.sort(function(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return apiSuccess_(notifs.slice(0, 30));
}

/**
 * Marks notification as read.
 */
function markNotificationRead_(notifId) {
  return dbUpdate_(TABLES.NOTIFICATIONS, notifId, { is_read: true });
}
