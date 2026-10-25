// ============================================================================
// Database.gs — Normalized Relational Database Layer for Google Sheets
// ============================================================================

/**
 * Table Schema Definitions
 * Defines column names and primary keys for all 27 relational tables.
 */
var SCHEMAS = {};

SCHEMAS[TABLES.USERS] = {
  pk: 'user_id',
  cols: ['user_id', 'email', 'password_hash', 'full_name', 'role', 'telephone', 'is_active', 'last_login', 'created_at']
};

SCHEMAS[TABLES.ROLES] = {
  pk: 'role_id',
  cols: ['role_id', 'role_name', 'description', 'permissions']
};

SCHEMAS[TABLES.COMMITTEE_MEMBERS] = {
  pk: 'member_id',
  cols: ['member_id', 'user_id', 'full_name', 'professional_category', 'institution', 'position', 'email', 'telephone', 'committee_role', 'date_assigned', 'coi_status', 'is_active', 'created_at']
};

SCHEMAS[TABLES.INVESTIGATORS] = {
  pk: 'investigator_id',
  cols: ['investigator_id', 'user_id', 'full_name', 'institution_id', 'institution_name', 'department', 'email', 'telephone', 'qualification', 'cv_drive_id', 'created_at']
};

SCHEMAS[TABLES.INSTITUTIONS] = {
  pk: 'institution_id',
  cols: ['institution_id', 'institution_name', 'code', 'institution_type', 'sub_city', 'woreda', 'contact_person', 'contact_email', 'telephone', 'is_active']
};

SCHEMAS[TABLES.PROTOCOLS] = {
  pk: 'protocol_id',
  cols: [
    'protocol_id', 'study_title', 'study_acronym', 'pi_id', 'pi_name', 'pi_email', 'institution_id', 'institution_name',
    'department', 'application_type', 'study_category', 'review_type', 'current_status', 'current_stage',
    'submission_date', 'approval_date', 'expiry_date', 'current_version', 'parent_protocol_id', 'is_archived',
    'lead_reviewer_id', 'lead_reviewer_name', 'administrative_officer', 'created_at', 'updated_at'
  ]
};

SCHEMAS[TABLES.PROTOCOL_DETAILS] = {
  pk: 'detail_id',
  cols: [
    'detail_id', 'protocol_id', 'study_objectives', 'background', 'study_design', 'study_population',
    'study_site', 'sample_size', 'recruitment_method', 'data_collection_method', 'study_duration_months',
    'start_date', 'end_date', 'created_at'
  ]
};

SCHEMAS[TABLES.PROTOCOL_ETHICS] = {
  pk: 'ethics_id',
  cols: [
    'ethics_id', 'protocol_id', 'informed_consent_process', 'vulnerable_populations', 'potential_risks',
    'expected_benefits', 'confidentiality_measures', 'data_protection', 'participant_compensation',
    'community_involvement', 'created_at'
  ]
};

SCHEMAS[TABLES.PROTOCOL_VERSIONS] = {
  pk: 'version_id',
  cols: ['version_id', 'protocol_id', 'version_number', 'submission_type', 'change_summary', 'submitted_by', 'submission_date', 'is_current']
};

SCHEMAS[TABLES.PROTOCOL_DOCUMENTS] = {
  pk: 'doc_id',
  cols: [
    'doc_id', 'protocol_id', 'doc_type', 'document_title', 'current_version', 'drive_file_id',
    'drive_url', 'file_name', 'mime_type', 'file_size_bytes', 'status', 'verification_notes',
    'verified_by', 'uploaded_by', 'uploaded_at', 'updated_at'
  ]
};

SCHEMAS[TABLES.DOCUMENT_VERSIONS] = {
  pk: 'doc_version_id',
  cols: [
    'doc_version_id', 'doc_id', 'protocol_id', 'version_number', 'file_name', 'drive_file_id',
    'drive_url', 'file_size_bytes', 'mime_type', 'uploaded_by', 'uploaded_at', 'change_reason', 'status'
  ]
};

SCHEMAS[TABLES.REVIEWER_ASSIGNMENTS] = {
  pk: 'assignment_id',
  cols: [
    'assignment_id', 'protocol_id', 'reviewer_id', 'reviewer_name', 'reviewer_email', 'assigned_by',
    'assigned_date', 'deadline_date', 'coi_declared', 'coi_declared_date', 'coi_notes', 'status',
    'completed_date', 'notes', 'created_at'
  ]
};

SCHEMAS[TABLES.ASSESSMENT_FORMS] = {
  pk: 'assessment_id',
  cols: [
    'assessment_id', 'protocol_id', 'reviewer_id', 'assignment_id', 'assessment_date', 'summary_notes',
    'investigator_verdict', 'site_verdict', 'participation_verdict', 'community_verdict',
    'recommendation', 'required_corrections', 'signature_approval', 'status', 'submitted_at'
  ]
};

SCHEMAS[TABLES.ASSESSMENT_ITEMS] = {
  pk: 'item_id',
  cols: ['item_id', 'assessment_id', 'protocol_id', 'reviewer_id', 'criteria_code', 'section_name', 'criteria_question', 'finding', 'reviewer_comment', 'required_correction', 'created_at']
};

SCHEMAS[TABLES.EXPEDITED_DETERMINATIONS] = {
  pk: 'expedited_id',
  cols: [
    'expedited_id', 'protocol_id', 'classified_by', 'classification_date', 'eligibility_category',
    'justification', 'consulted_chair_id', 'consultation_date', 'chair_concurrence',
    'assigned_reviewer_id', 'review_date', 'decision', 'communication_date', 'created_at'
  ]
};

SCHEMAS[TABLES.AMENDMENTS] = {
  pk: 'amendment_id',
  cols: [
    'amendment_id', 'protocol_id', 'amendment_number', 'submission_date', 'amendment_title',
    'amendment_type', 'review_path', 'rationale', 'summary_of_changes', 'chair_notified_date',
    'status', 'decision_id', 'decision_date', 'submitted_by', 'created_at'
  ]
};

SCHEMAS[TABLES.CONTINUING_REVIEWS] = {
  pk: 'cont_review_id',
  cols: [
    'cont_review_id', 'protocol_id', 'submission_date', 'current_study_status', 'target_sample_size',
    'enrolled_participants', 'progress_summary', 'adverse_events_count', 'adverse_events_summary',
    'protocol_deviations_summary', 'next_review_date', 'decision_id', 'status', 'submitted_by', 'created_at'
  ]
};

SCHEMAS[TABLES.TERMINATIONS] = {
  pk: 'termination_id',
  cols: [
    'termination_id', 'protocol_id', 'submission_date', 'submitted_by', 'reason_for_termination',
    'study_completion_status', 'total_participants_enrolled', 'summary_of_findings',
    'final_report_doc_id', 'decision_id', 'archival_date', 'status', 'created_at'
  ]
};

SCHEMAS[TABLES.IRERC_MEETINGS] = {
  pk: 'meeting_id',
  cols: [
    'meeting_id', 'meeting_number', 'meeting_date', 'meeting_time', 'venue', 'chairperson_id',
    'chairperson_name', 'secretary_id', 'status', 'agenda_summary', 'minutes_text',
    'minutes_drive_id', 'created_at'
  ]
};

SCHEMAS[TABLES.MEETING_AGENDA_ITEMS] = {
  pk: 'agenda_item_id',
  cols: [
    'agenda_item_id', 'meeting_id', 'protocol_id', 'sequence_order', 'review_type', 'lead_reviewer_id',
    'lead_reviewer_name', 'discussion_summary', 'meeting_recommendation', 'responsible_person', 'follow_up_date'
  ]
};

SCHEMAS[TABLES.MEETING_ATTENDEES] = {
  pk: 'attendance_id',
  cols: ['attendance_id', 'meeting_id', 'member_id', 'member_name', 'attendance_status', 'coi_recusals', 'notes']
};

SCHEMAS[TABLES.DECISIONS] = {
  pk: 'decision_id',
  cols: [
    'decision_id', 'protocol_id', 'meeting_id', 'decision_type', 'decision_date', 'chairperson_id',
    'chairperson_name', 'quorum_members_count', 'summary_comments', 'conditions_summary',
    'modifications_required', 'approval_letter_doc_id', 'valid_from_date', 'valid_until_date',
    'communication_date', 'status', 'created_at'
  ]
};

SCHEMAS[TABLES.DECISION_CONDITIONS] = {
  pk: 'condition_id',
  cols: ['condition_id', 'decision_id', 'protocol_id', 'condition_type', 'description', 'due_date', 'compliance_status', 'verified_by', 'verified_date']
};

SCHEMAS[TABLES.COMMUNICATIONS] = {
  pk: 'comm_id',
  cols: [
    'comm_id', 'protocol_id', 'comm_type', 'recipient_email', 'recipient_name', 'sender_email',
    'sent_at', 'subject', 'message_body', 'attached_doc_ids', 'delivery_status', 'created_at'
  ]
};

SCHEMAS[TABLES.NOTIFICATIONS] = {
  pk: 'notification_id',
  cols: ['notification_id', 'user_id', 'user_email', 'protocol_id', 'title', 'message', 'type', 'is_read', 'created_at']
};

SCHEMAS[TABLES.AUDIT_LOGS] = {
  pk: 'audit_id',
  cols: ['audit_id', 'protocol_id', 'user_id', 'user_name', 'user_role', 'action', 'previous_status', 'new_status', 'ip_address', 'user_agent', 'comments', 'timestamp']
};

SCHEMAS[TABLES.SYSTEM_SETTINGS] = {
  pk: 'setting_key',
  cols: ['setting_key', 'setting_value', 'description', 'updated_by', 'updated_at']
};

// ============================================================================
// Spreadsheet Database Accessors and CRUD Operations
// ============================================================================

/**
 * Returns the explicitly configured institutional Spreadsheet database.
 */
function getDatabaseSpreadsheet_() {
  var spreadsheetId = String(CFG.DB_SS_ID || '').trim();
  if (!spreadsheetId) {
    throw new Error('Configure CFG.DB_SS_ID with an institution-owned spreadsheet ID before using the database.');
  }

  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    Logger.log('Could not open configured CFG.DB_SS_ID: ' + e.message);
    throw new Error('Unable to access CFG.DB_SS_ID. Verify that it is an approved spreadsheet and the deploying account has access.');
  }
}

/**
 * Retrieves a Sheet instance by table name, automatically creating it if missing.
 */
function getTableSheet_(tableName) {
  var ss = getDatabaseSpreadsheet_();
  var sheet = ss.getSheetByName(tableName);

  if (!sheet) {
    sheet = ss.insertSheet(tableName);
    var schema = SCHEMAS[tableName];
    if (schema) {
      sheet.appendRow(schema.cols);
      var headerRange = sheet.getRange(1, 1, 1, schema.cols.length);
      headerRange.setBackground('#1a3a5c');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Executes a function with a script lock to prevent race conditions.
 */
function withTransactionLock_(operationFn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Wait up to 30s
    return operationFn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Inserts a single record into a relational table.
 */
function dbInsert_(tableName, record) {
  return withTransactionLock_(function() {
    var sheet = getTableSheet_(tableName);
    var schema = SCHEMAS[tableName];
    if (!schema) throw new Error('Unknown table schema for: ' + tableName);

    // Auto-generate PK if missing
    if (!record[schema.pk]) {
      record[schema.pk] = generateUuid_();
    }

    if (schema.cols.indexOf('created_at') !== -1 && !record.created_at) {
      record.created_at = new Date().toISOString();
    }
    if (schema.cols.indexOf('updated_at') !== -1 && !record.updated_at) {
      record.updated_at = new Date().toISOString();
    }

    var rowValues = schema.cols.map(function(col) {
      var val = record[col];
      return val !== undefined && val !== null ? val : '';
    });

    sheet.appendRow(rowValues);
    return record;
  });
}

/**
 * Finds a single record by its primary key.
 */
function dbFindById_(tableName, idValue) {
  var sheet = getTableSheet_(tableName);
  var schema = SCHEMAS[tableName];
  if (!schema) throw new Error('Unknown table schema: ' + tableName);

  var pkColIndex = schema.cols.indexOf(schema.pk);
  if (pkColIndex === -1) throw new Error('Primary key not in schema: ' + schema.pk);

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][pkColIndex]) === String(idValue)) {
      return rowToObject_(schema.cols, data[r], r + 1);
    }
  }
  return null;
}

/**
 * Finds all records matching a filter function.
 */
function dbFind_(tableName, filterFn) {
  var sheet = getTableSheet_(tableName);
  var schema = SCHEMAS[tableName];
  if (!schema) throw new Error('Unknown table schema: ' + tableName);

  var data = sheet.getDataRange().getValues();
  var results = [];
  if (data.length <= 1) return results;

  for (var r = 1; r < data.length; r++) {
    var obj = rowToObject_(schema.cols, data[r], r + 1);
    if (!filterFn || filterFn(obj)) {
      results.push(obj);
    }
  }
  return results;
}

/**
 * Retrieves all rows from a table as an array of objects.
 */
function dbGetAll_(tableName) {
  return dbFind_(tableName, null);
}

/**
 * Updates a record in a table by its primary key.
 */
function dbUpdate_(tableName, idValue, updates) {
  return withTransactionLock_(function() {
    var sheet = getTableSheet_(tableName);
    var schema = SCHEMAS[tableName];
    if (!schema) throw new Error('Unknown table schema: ' + tableName);

    var pkColIndex = schema.cols.indexOf(schema.pk);
    var data = sheet.getDataRange().getValues();

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][pkColIndex]) === String(idValue)) {
        var rowNumber = r + 1;
        var existingRecord = rowToObject_(schema.cols, data[r], rowNumber);

        if (schema.cols.indexOf('updated_at') !== -1) {
          updates.updated_at = new Date().toISOString();
        }

        var merged = Object.assign({}, existingRecord, updates);

        for (var c = 0; c < schema.cols.length; c++) {
          var colName = schema.cols[c];
          if (updates.hasOwnProperty(colName)) {
            sheet.getRange(rowNumber, c + 1).setValue(updates[colName] !== undefined && updates[colName] !== null ? updates[colName] : '');
          }
        }
        return merged;
      }
    }
    throw new Error('Record with ID ' + idValue + ' not found in ' + tableName);
  });
}

/**
 * Generates next sequential protocol number (e.g., IRERC-2026-0001).
 */
function getNextProtocolCode_() {
  return withTransactionLock_(function() {
    var year = new Date().getFullYear();
    var prefix = CFG.PROTOCOL_ID_PREFIX + '-' + year + '-';
    var sheet = getTableSheet_(TABLES.PROTOCOLS);
    var data = sheet.getDataRange().getValues();
    var maxNum = 0;

    var pCol = SCHEMAS[TABLES.PROTOCOLS].cols.indexOf('protocol_id');
    for (var i = 1; i < data.length; i++) {
      var idStr = String(data[i][pCol] || '');
      if (idStr.indexOf(prefix) === 0) {
        var numPart = parseInt(idStr.substring(prefix.length), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }

    var nextNum = maxNum + 1;
    var padded = ('0000' + nextNum).slice(-CFG.PROTOCOL_ID_DIGITS);
    return prefix + padded;
  });
}

/**
 * Initializes all database tables and schema headers.
 */
function initDatabase_() {
  var ss = getDatabaseSpreadsheet_();
  var tableNames = Object.keys(SCHEMAS);

  for (var i = 0; i < tableNames.length; i++) {
    var tbl = tableNames[i];
    getTableSheet_(tbl);
  }

  // Clean default 'Sheet1' if present and empty
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      // Ignored if cannot delete
    }
  }

  Logger.log('Database initialized successfully with ' + tableNames.length + ' tables.');
  return { success: true, tableCount: tableNames.length };
}

/**
 * Converts a table row array to an object using column schema.
 */
function rowToObject_(cols, rowValues, rowNumber) {
  var obj = { _rowNumber: rowNumber };
  for (var c = 0; c < cols.length; c++) {
    var val = rowValues[c];
    if (val instanceof Date) {
      val = val.toISOString();
    }
    obj[cols[c]] = val;
  }
  return obj;
}

/**
 * Generates a standard UUID string.
 */
function generateUuid_() {
  return Utilities.getUuid();
}
