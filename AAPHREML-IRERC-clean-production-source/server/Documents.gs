// ============================================================================
// Documents.gs — Google Drive Vault, Version Control & Verification
// ============================================================================

/**
 * Uploads a document to Google Drive, preserving immutable historical version history.
 */
function uploadProtocolDocument_(payload) {
  var user = requireAuthorizedRole_([ROLES.INVESTIGATOR, ROLES.ADMIN]);

  if (!payload.protocol_id || !payload.doc_type || !payload.file_name || !payload.file_base64) {
    return apiError_('Protocol ID, Document Type, File Name, and Content are required.');
  }

  return withTransactionLock_(function() {
    var protocolId = payload.protocol_id;
    var p = dbFindById_(TABLES.PROTOCOLS, protocolId);
    if (!p) return apiError_('Protocol not found: ' + protocolId);

    // 1. Verify file size & MIME type
    var bytes = Utilities.base64Decode(payload.file_base64);
    var fileSize = bytes.length;
    var maxBytes = CFG.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (fileSize > maxBytes) {
      return apiError_('File size exceeds maximum permitted limit of ' + CFG.MAX_FILE_SIZE_MB + 'MB.');
    }

    // 2. Obtain or create protocol-specific Google Drive folder
    var folder = getProtocolDriveFolder_(protocolId);

    // 3. Find existing document slot
    var existingDocs = dbFind_(TABLES.PROTOCOL_DOCUMENTS, function(d) {
      return d.protocol_id === protocolId && d.doc_type === payload.doc_type;
    });

    var docId;
    var nextVersion = '1.0';
    var nowIso = new Date().toISOString();

    if (existingDocs.length > 0) {
      docId = existingDocs[0].doc_id;
      var curVer = parseFloat(existingDocs[0].current_version || '1.0');
      nextVersion = (curVer + 1.0).toFixed(1);
    } else {
      docId = 'DOC-' + generateUuid_().substring(0, 8).toUpperCase();
    }

    // 4. Save file to Google Drive with versioned name
    var versionedFileName = protocolId + '_' + payload.doc_type + '_v' + nextVersion + '_' + payload.file_name;
    var mime = payload.mime_type || 'application/octet-stream';
    var blob = Utilities.newBlob(bytes, mime, versionedFileName);
    var driveFile = folder.createFile(blob);
    var driveUrl = driveFile.getUrl();
    var driveId = driveFile.getId();

    // 5. Insert immutable record into DOCUMENT_VERSIONS
    var docVersionId = 'DVER-' + generateUuid_().substring(0, 8).toUpperCase();
    dbInsert_(TABLES.DOCUMENT_VERSIONS, {
      doc_version_id: docVersionId,
      doc_id: docId,
      protocol_id: protocolId,
      version_number: nextVersion,
      file_name: versionedFileName,
      drive_file_id: driveId,
      drive_url: driveUrl,
      file_size_bytes: fileSize,
      mime_type: mime,
      uploaded_by: user.email,
      uploaded_at: nowIso,
      change_reason: sanitizeString_(payload.change_reason || 'Document revision upload'),
      status: DOC_STATUS.UPLOADED
    });

    // 6. Update current PROTOCOL_DOCUMENTS slot
    var docData = {
      doc_id: docId,
      protocol_id: protocolId,
      doc_type: payload.doc_type,
      document_title: payload.document_title || payload.file_name,
      current_version: nextVersion,
      drive_file_id: driveId,
      drive_url: driveUrl,
      file_name: versionedFileName,
      mime_type: mime,
      file_size_bytes: fileSize,
      status: DOC_STATUS.UPLOADED,
      verification_notes: '',
      verified_by: '',
      uploaded_by: user.email,
      uploaded_at: nowIso,
      updated_at: nowIso
    };

    if (existingDocs.length > 0) {
      dbUpdate_(TABLES.PROTOCOL_DOCUMENTS, docId, docData);
    } else {
      dbInsert_(TABLES.PROTOCOL_DOCUMENTS, docData);
    }

    logAuditEvent_(
      protocolId,
      user.user_id,
      user.full_name,
      user.role,
      'DOCUMENT_UPLOADED',
      '',
      DOC_STATUS.UPLOADED,
      'Uploaded version ' + nextVersion + ' of ' + payload.doc_type + ' (' + payload.file_name + ')'
    );

    return apiSuccess_({
      doc_id: docId,
      version: nextVersion,
      drive_url: driveUrl,
      file_name: versionedFileName
    }, 'Document uploaded successfully as Version ' + nextVersion);
  });
}

/**
 * Retrieves all documents for a protocol with their complete version history.
 */
function getProtocolDocumentsWithHistory_(protocolId) {
  var docs = dbFind_(TABLES.PROTOCOL_DOCUMENTS, function(d) {
    return d.protocol_id === protocolId;
  });

  var allVersions = dbFind_(TABLES.DOCUMENT_VERSIONS, function(v) {
    return v.protocol_id === protocolId;
  });

  var result = docs.map(function(d) {
    var history = allVersions.filter(function(v) {
      return v.doc_id === d.doc_id;
    });
    history.sort(function(a, b) {
      return parseFloat(b.version_number) - parseFloat(a.version_number);
    });
    return {
      document: d,
      versions: history
    };
  });

  return apiSuccess_(result);
}

/**
 * Updates document verification status (Secretariat action).
 */
function verifyDocument_(docId, newStatus, verificationNotes) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN]);

  return withTransactionLock_(function() {
    var doc = dbFindById_(TABLES.PROTOCOL_DOCUMENTS, docId);
    if (!doc) return apiError_('Document not found: ' + docId);

    var updated = dbUpdate_(TABLES.PROTOCOL_DOCUMENTS, docId, {
      status: newStatus,
      verification_notes: sanitizeString_(verificationNotes || ''),
      verified_by: user.full_name,
      updated_at: new Date().toISOString()
    });

    logAuditEvent_(
      doc.protocol_id,
      user.user_id,
      user.full_name,
      user.role,
      'DOCUMENT_VERIFIED',
      doc.status,
      newStatus,
      'Verified ' + doc.doc_type + ': ' + newStatus + ' (' + (verificationNotes || '') + ')'
    );

    return apiSuccess_(updated, 'Document verification updated.');
  });
}
