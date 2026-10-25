// ============================================================================
// Utils.gs — Shared Utilities, Security Sanitization & Helper Functions
// ============================================================================

/**
 * Standard API Success Response
 */
function apiSuccess_(data, message) {
  return {
    success: true,
    data: data || null,
    message: message || 'Operation completed successfully.',
    timestamp: new Date().toISOString()
  };
}

/**
 * Standard API Error Response
 */
function apiError_(message, details) {
  return {
    success: false,
    error: message || 'An error occurred during execution.',
    details: details || null,
    timestamp: new Date().toISOString()
  };
}

function _digestHex_(rawBytes) {
  var hash = '';
  for (var i = 0; i < rawBytes.length; i++) {
    var byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    var byteStr = byteVal.toString(16);
    if (byteStr.length === 1) byteStr = '0' + byteStr;
    hash += byteStr;
  }
  return hash;
}

function hashPassword_(password, salt) {
  if (!password) return '';
  var saltToUse = salt || Utilities.getUuid() + Utilities.getUuid();
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + saltToUse,
    Utilities.Charset.UTF_8
  );
  return 'v2$' + saltToUse + '$' + _digestHex_(digest);
}

function _constantTimeEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return false;
  }
  var difference = 0;
  for (var i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function verifyPassword_(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) return false;

  var parts = String(storedHash).split('$');
  if (parts.length === 3 && parts[0] === 'v2') {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      plainPassword + parts[1],
      Utilities.Charset.UTF_8
    );
    return _constantTimeEqual_(_digestHex_(digest), parts[2]);
  }

  var legacyDigest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    plainPassword + 'AAPHREML-IRERC_SECURE_SALT_2026',
    Utilities.Charset.UTF_8
  );
  return _constantTimeEqual_(_digestHex_(legacyDigest), String(storedHash));
}

function isPasswordUnique_(password) {
  var users = dbGetAll_(TABLES.USERS);
  return !users.some(function(user) {
    return verifyPassword_(password, user.password_hash);
  });
}

/**
 * Sanitizes strings against XSS and spreadsheet formula injection.
 */
function sanitizeString_(str) {
  if (str === null || str === undefined) return '';
  var s = String(str).trim();
  // Strip formula injection triggers
  if (/^[=+@-]/.test(s)) {
    s = "'" + s;
  }
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates Email Address format
 */
function isValidEmail_(email) {
  if (!email || typeof email !== 'string') return false;
  var re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * Calculates deadline adding working days (excluding Saturday & Sunday)
 */
function calculateWorkingDaysDeadline_(startDate, numWorkingDays) {
  var d = new Date(startDate);
  var added = 0;
  while (added < numWorkingDays) {
    d.setDate(d.getDate() + 1);
    var day = d.getDay();
    if (day !== 0 && day !== 6) { // 0=Sun, 6=Sat
      added++;
    }
  }
  return d.toISOString();
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
function formatDateIso_(dateObj) {
  if (!dateObj) return '';
  var d = new Date(dateObj);
  if (isNaN(d.getTime())) return '';
  var month = '' + (d.getMonth() + 1);
  var day = '' + d.getDate();
  var year = d.getFullYear();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return [year, month, day].join('-');
}

/**
 * Retrieves or creates a dedicated Google Drive folder for protocol documents.
 */
function getOrCreateDriveFolder_(folderName, parentFolder) {
  if (parentFolder) {
    var targetName = folderName || CFG.ROOT_FOLDER_NAME;
    var childFolders = parentFolder.getFoldersByName(targetName);
    if (childFolders.hasNext()) return childFolders.next();
    return parentFolder.createFolder(targetName);
  }

  var folderId = String(CFG.FOLDER_ID || '').trim();
  if (!folderId) {
    throw new Error('Configure CFG.FOLDER_ID with the institution-owned Drive vault folder ID.');
  }
  return DriveApp.getFolderById(folderId);
}

/**
 * Obtains or creates a protocol-specific document folder in Google Drive.
 */
function getProtocolDriveFolder_(protocolId) {
  var rootFolder = getOrCreateDriveFolder_(CFG.ROOT_FOLDER_NAME);
  return getOrCreateDriveFolder_(protocolId, rootFolder);
}
