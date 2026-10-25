// ============================================================================
// Audit.gs — Immutable Audit Trail & System Activity Logging
// ============================================================================

/**
 * Appends an immutable audit log entry.
 */
function logAuditEvent_(protocolId, userId, userName, userRole, action, prevStatus, newStatus, comments) {
  try {
    var entry = {
      audit_id: 'AUD-' + generateUuid_().substring(0, 8).toUpperCase(),
      protocol_id: protocolId || 'SYSTEM',
      user_id: userId || 'ANONYMOUS',
      user_name: userName || 'System Automated Process',
      user_role: userRole || 'System',
      action: action,
      previous_status: prevStatus || '',
      new_status: newStatus || '',
      ip_address: 'Google Cloud Platform (Secure)',
      user_agent: 'AAPHREML-IRERC Web Client',
      comments: comments || '',
      timestamp: new Date().toISOString()
    };

    dbInsert_(TABLES.AUDIT_LOGS, entry);
    return entry;
  } catch (e) {
    Logger.log('Failed to write audit log: ' + e.message);
  }
}

/**
 * Retrieves the complete audit trail for a specific protocol.
 */
function getProtocolAuditTrail_(protocolId) {
  var user = getSessionUser_();
  if (!user) throw new Error('Authentication required.');

  if (!protocolId) return apiError_('Protocol ID is required.');

  var logs = dbFind_(TABLES.AUDIT_LOGS, function(log) {
    return String(log.protocol_id) === String(protocolId);
  });

  // Sort descending by timestamp
  logs.sort(function(a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  return apiSuccess_(logs);
}

/**
 * Retrieves system-wide audit logs with filters (Admin and Secretariat privilege only).
 */
function getSystemAuditLogs_(filters) {
  requireAuthorizedRole_([ROLES.ADMIN, ROLES.SECRETARIAT, ROLES.CHAIR]);

  var f = filters || {};
  var logs = dbFind_(TABLES.AUDIT_LOGS, function(log) {
    if (f.protocol_id && String(log.protocol_id).toLowerCase().indexOf(String(f.protocol_id).toLowerCase()) === -1) {
      return false;
    }
    if (f.user_id && String(log.user_id) !== String(f.user_id)) {
      return false;
    }
    if (f.action && String(log.action).toLowerCase().indexOf(String(f.action).toLowerCase()) === -1) {
      return false;
    }
    return true;
  });

  logs.sort(function(a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  return apiSuccess_(logs.slice(0, 200)); // Return latest 200 logs
}
