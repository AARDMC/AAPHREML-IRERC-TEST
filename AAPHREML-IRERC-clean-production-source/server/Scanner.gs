// ============================================================================
// Scanner.gs — Automated Proposal Document Completeness & Structural Scanner
// AAPHREML-IRERC Proposal Validation Engine
// ============================================================================

/**
 * 28 Core Required Protocol Sections & Intelligent Multi-pattern Matchers
 * Matches Ethiopian Health Research Guidelines & National Ethics Standards
 */
var SCANNER_CONFIG = {
  MAIN_SHEET_NAME: 'Extracted Data',
  CHECKLIST_SHEET_NAME: 'Completeness Check',

  // 28 Strict Required Sections
  SECTIONS: {
    '1. Title': ['title page', 'cover page', 'research title', 'study title', 'project title', 'thesis title'],
    '2. Abstract': ['abstract', 'executive summary', 'summary', 'project summary', 'research summary', 'synopsis'],
    '3. Background': ['background', 'background of the study', 'introduction', 'study background'],
    '4. Problem Statement': ['problem statement', 'statement of the problem', 'research problem', 'problem justification'],
    '5. General Objective': ['general objective', 'broad objective', 'main objective', 'overall objective', 'aim of the study'],
    '6. Specific Objectives': ['specific objectives', 'specific objective', 'specific aims'],
    '7. Literature Review': ['literature review', 'review of literature', 'review of related literature', 'empirical review', 'conceptual framework', 'theoretical framework'],
    '8. Study Area': ['study area', 'study setting', 'study site', 'description of study area'],
    '9. Study Period': ['study area and period', 'study setting and period', 'study design and period', 'study period', 'period of study', 'duration of study', 'data collection period'],
    '10. Study Design': ['study design', 'research design', 'research methodology', 'research approach'],
    '11. Source Population': ['source population', 'reference population'],
    '12. Study Population': ['study population', 'target population', 'population of interest', 'study subjects', 'study participants'],
    '13. Inclusion Criteria': ['inclusion and exclusion criteria', 'inclusion criteria', 'eligibility criteria', 'selection criteria'],
    '14. Exclusion Criteria': ['inclusion and exclusion criteria', 'exclusion criteria', 'ineligibility criteria'],
    '15. Sample Size Determination': ['sample size determination', 'sample size calculation', 'sample size', 'power calculation', 'power analysis'],
    '16. Sampling Technique': ['sampling technique', 'sampling procedure', 'sampling method', 'sampling strategy', 'participant recruitment'],
    '17. Variables': ['study variables', 'variables of the study', 'dependent and independent variables', 'dependent variables', 'independent variables', 'outcome variables'],
    '18. Operational Definitions': ['operational definition', 'definition of terms', 'definitions of terms', 'working definitions'],
    '19. Data Collection Tools': ['data collection tools', 'data collection instrument', 'study instrument', 'research instrument', 'survey instrument'],
    '20. Data Collection Procedure': ['data collection procedure', 'data collection method', 'methods of data collection', 'field procedures', 'study procedures'],
    '21. Data Quality Assurance': ['data quality assurance', 'data quality management', 'data quality control', 'quality assurance', 'quality control', 'validity and reliability'],
    '22. Data Processing and Analysis': ['data processing and analysis', 'data analysis', 'statistical analysis', 'data management', 'data analysis plan', 'data entry and analysis'],
    '23. Ethical Consideration': ['ethical consideration', 'ethical clearance', 'ethical approval', 'ethical issues', 'research ethics', 'informed consent'],
    '24. Dissemination Plan': ['dissemination plan', 'dissemination of results', 'dissemination', 'publication plan', 'knowledge translation'],
    '25. Work Plan / Time Schedule': ['work plan', 'time schedule', 'timeline', 'gantt chart', 'activity schedule', 'work schedule'],
    '26. Budget': ['budget', 'cost estimate', 'budget breakdown', 'estimated budget', 'project budget'],
    '27. References': ['references', 'reference', 'bibliography', 'reference list'],
    '28. Annex / Appendix': ['annex', 'appendix', 'appendices', 'questionnaire', 'consent form', 'interview guide', 'data collection form']
  },

  // Key Metadata Fields Extracted Automatically from Proposal Text
  FIELD_PATTERNS: {
    'title': ['project title', 'research title', 'proposal title', 'title'],
    'phoneNumber': ['phone number', 'telephone', 'contact number', 'mobile', 'phone'],
    'email': ['email address', 'e-mail', 'email'],
    'institution': ['institution', 'affiliation', 'organization', 'university'],
    'studyPeriod': ['study area and period', 'study period', 'time frame', 'duration'],
    'population': ['study population', 'target population', 'population'],
    'inclusionCriteria': ['inclusion and exclusion criteria', 'inclusion criteria'],
    'exclusionCriteria': ['inclusion and exclusion criteria', 'exclusion criteria'],
    'sampleSize': ['sample size', 'number of participants'],
    'samplingTechnique': ['sampling technique', 'sampling procedure', 'sampling method'],
    'dataCollection': ['data collection tools and procedure', 'data collection'],
    'dataAnalysis': ['data processing and analysis', 'data analysis', 'statistical analysis']
  }
};

/**
 * Entry point: Processes an uploaded proposal Word/PDF document,
 * checks for all 28 required sections, logs to Google Sheets, and returns completeness metrics.
 */
function processUploadedFile_(fileName, fileData) {
  var t0 = new Date();
  var storedName = Date.now() + '_' + fileName; // unique identifier

  // Strictly enforce Microsoft Word document format (.docx or .doc)
  if (!/\.(docx|doc)$/i.test(fileName)) {
    return {
      success: false,
      fileName: fileName,
      error: 'The Complete Proposal Document must strictly be a Microsoft Word document (.docx or .doc). PDF and other formats are not accepted for the automated 28-section structural scan.',
      message: 'Invalid file format: Strictly Microsoft Word (.docx or .doc) document required.'
    };
  }

  try {
    var folderId = String(CFG.FOLDER_ID || '').trim();
    if (!folderId) throw new Error('Configure CFG.FOLDER_ID with the institution-owned Drive vault folder ID.');
    var rawId = stepOne_UploadToDrive_(storedName, fileData, folderId);
    var docId = stepTwo_ConvertToGoogleDoc_(rawId, storedName, folderId);
    var d = stepThree_ScanDocument_(docId, storedName);

    writeToSpreadsheet_(d);

    var total = Object.keys(SCANNER_CONFIG.SECTIONS).length;
    var present = Object.values(d.checklist).filter(function(v) { return v === 'Yes'; }).length;
    var pct = parseFloat(((present / total) * 100).toFixed(1));

    return {
      success: true,
      fileName: fileName,
      storedName: storedName,
      message: 'Processed in ' + ((new Date() - t0) / 1000).toFixed(1) + 's',
      checklistData: d.checklist,
      missingCount: d.missingCount,
      missingSections: d.missingSections,
      completenessPercentage: pct.toFixed(1),
      totalSections: total,
      presentSections: present
    };
  } catch (error) {
    console.error('Proposal Scanner Pipeline Error: ', error);
    return {
      success: false,
      fileName: fileName,
      error: error.toString(),
      message: 'Word document scan failed: ' + error
    };
  }
}

/**
 * Uploads raw Word document to Google Drive.
 */
function stepOne_UploadToDrive_(fileName, fileData, folderId) {
  var b64 = fileData.indexOf(',') !== -1 ? fileData.split(',')[1] : fileData;
  var n = fileName.toLowerCase();
  var mime = n.indexOf('.docx') !== -1
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/msword';

  var targetFolder;
  if (!folderId) throw new Error('Configure CFG.FOLDER_ID with the institution-owned Drive vault folder ID.');
  targetFolder = DriveApp.getFolderById(folderId);

  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, fileName);
  return targetFolder.createFile(blob).getId();
}

/**
 * Converts Word Document (DOCX / DOC) to Google Doc for semantic structural text scanning.
 */
function stepTwo_ConvertToGoogleDoc_(rawFileId, fileName, folderId) {
  var raw = DriveApp.getFileById(rawFileId);
  if (raw.getMimeType() === MimeType.GOOGLE_DOCS) return rawFileId;

  var res = {
    name: fileName.replace(/\.(docx?)$/i, ''),
    mimeType: MimeType.GOOGLE_DOCS,
    parents: folderId ? [folderId] : []
  };

  // Use Drive API v2/v3
  if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.create) {
    var conv = Drive.Files.create(res, raw.getBlob());
    Utilities.sleep(2000);
    return conv.id;
  } else if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
    var convLegacy = Drive.Files.insert(res, raw.getBlob(), { convert: true });
    Utilities.sleep(2000);
    return convLegacy.id;
  }

  // Fallback if Drive Advanced Service not enabled: return rawFileId
  return rawFileId;
}

/**
 * Scans converted Google Doc for sections and metadata.
 */
function stepThree_ScanDocument_(docId, storedName) {
  var doc = DocumentApp.openById(docId);
  var text = extractTextIntelligently_(doc);
  if (!text || text.length < 50) throw new Error('Converted proposal document is empty or unreadable.');

  var norm = text.toLowerCase();
  var checklist = {};
  var missing = [];

  for (var section in SCANNER_CONFIG.SECTIONS) {
    var patterns = SCANNER_CONFIG.SECTIONS[section];
    var found = false;

    if (section === '1. Title') {
      found = !!detectTitle_(text);
    }

    if (!found) {
      for (var p = 0; p < patterns.length; p++) {
        var patternStr = patterns[p];
        var escaped = patternStr.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Strategy 1: exact phrase match (fastest, most precise)
        var exactRegex = new RegExp('(?:^|\\n|\\s{2,}|[:\\-])\\s*' + escaped + 's?\\s*(?:$|\\n|[:\\-])', 'i');
        if (exactRegex.test(norm)) {
          found = true;
          break;
        }

        // Strategy 2: heading-line match — pattern occupies most of a short line (≤60 chars)
        var lines = norm.split('\n');
        var headingFound = lines.some(function(line) {
          var trimmed = line.trim();
          // Must be a short line (heading-like) and contain the pattern
          if (trimmed.length > 0 && trimmed.length <= 80) {
            var headRegex = new RegExp('\\b' + escaped + 's?\\b', 'i');
            return headRegex.test(trimmed);
          }
          return false;
        });
        if (headingFound) {
          found = true;
          break;
        }

        // Strategy 3: tight proximity match — at most 1 intervening word between
        // each keyword word (prevents false positives from scattered words)
        var words = escaped.split(/\s+/);
        if (words.length > 1) {
          var tight = words.map(function(w, i) {
            return i === words.length - 1 ? w + '(?:s|es)?' : w;
          }).join('(?:\\W+\\w+){0,1}\\W+');
          var tightRegex = new RegExp('\\b' + tight + '\\b', 'i');
          if (tightRegex.test(norm)) {
            found = true;
            break;
          }
        }
      }
    }

    checklist[section] = found ? 'Yes' : 'No';
    if (!found) {
      missing.push(section.replace(/^\d+\.\s*/, ''));
    }
  }

  var ex = {
    fileName: storedName,
    docUrl: doc.getUrl(),
    processingDate: new Date().toLocaleString(),
    checklist: checklist
  };

  for (var field in SCANNER_CONFIG.FIELD_PATTERNS) {
    ex[field] = 'Missing';
    var fPatterns = SCANNER_CONFIG.FIELD_PATTERNS[field];
    for (var k = 0; k < fPatterns.length; k++) {
      var val = scanForValue_(text, fPatterns[k]);
      if (val) {
        ex[field] = sanitizeData_(field, val);
        break;
      }
    }
  }

  ex.title = detectTitle_(text) || ex.title;
  ex.missingSections = missing.length ? missing.join(', ') : 'None';
  ex.missingCount = missing.length;

  return ex;
}

/**
 * Intelligent cover-page research title detector.
 */
function detectTitle_(text) {
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean).slice(0, 30);
  var stop = /^(by|submitted|prepared by|presented by|a (proposal|thesis|research|dissertation)|proposal submitted|name|advisor|date)\b/i;
  var inst = /\b(college|university|institute|school|department|faculty|ministry|republic)\b/i;
  var block = [];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (stop.test(l)) { if (block.length) break; continue; }
    if (/^(table of contents|contents|abstract|acknowledg)/i.test(l)) break;
    if (l.split(/\s+/).length >= 4 && !inst.test(l)) {
      block.push(l);
    } else if (block.length) {
      break;
    }
  }

  var t = block.join(' ');
  return t.split(/\s+/).length >= 6 ? t : null;
}

/**
 * Extracts plain text from paragraphs and tables.
 */
function extractTextIntelligently_(doc) {
  var lines = [];
  var body = doc.getBody();

  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    var t = el.getType();
    if (t === DocumentApp.ElementType.PARAGRAPH || t === DocumentApp.ElementType.LIST_ITEM) {
      var x = el.getText().trim();
      if (x) lines.push(x);
    } else if (t === DocumentApp.ElementType.TABLE) {
      for (var r = 0; r < el.getNumRows(); r++) {
        var row = el.getRow(r);
        var cells = [];
        for (var c = 0; c < row.getNumCells(); c++) {
          cells.push(row.getCell(c).getText().trim());
        }
        lines.push(cells.length === 2 && cells[0] && cells[0].length < 50 ? cells[0] + ': ' + cells[1] : cells.join(' | '));
      }
    }
  }
  return lines.join('\n');
}

/**
 * Scans for specific pattern values in text.
 */
function scanForValue_(text, pattern) {
  var sp = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var m = text.match(new RegExp('(?:^|\\n|\\|)\\s*(?:[\\d\\.]+\\s*)?' + sp + '\\s*[:\\-]?\\s*([^\\n\\|]+(?:\\n(?![A-Z][a-z]+[\\s:]).*[^\\n\\|]+)?)', 'i'));
  if (!m || !m[1]) return null;

  var val = m[1].replace(/[\r\n]+/g, ' ').trim().split('.')[0];
  var fluff = /^(is\s+|are\s+|was\s+|were\s+|will be\s+|located in\s+|located at\s+|conducted in\s+|conducted at\s+|carried out in\s+|carried out at\s+|the\s+|a\s+|an\s+|this\s+|study\s+|research\s+|will utilize\s+|consists of\s+|comprises\s+|of\s+|for\s+)+/i;
  while (fluff.test(val)) val = val.replace(fluff, '').trim();
  val = val.replace(/[,:;\-\s]+$/, '').trim();

  if (val.length > 2 && val.length < 300 && !/^(missing|none|n\/a|unknown|tbd|to be determined)$/i.test(val)) {
    return val.charAt(0).toUpperCase() + val.slice(1);
  }
  return null;
}

/**
 * Sanitizes phone and email formats.
 */
function sanitizeData_(field, value) {
  if (field === 'email') {
    var m = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m ? m[0] : value;
  }
  if (field === 'phoneNumber') {
    var mp = value.match(/(?:\+?\d{1,3}[-\s.]?)?\(?\d{2,3}\)?[-\s.]?\d{3}[-\s.]?\d{3,4}/);
    return mp ? mp[0] : value;
  }
  return value;
}

/**
 * Logs scanned protocol metrics to Extracted Data and Completeness Check sheets.
 */
function writeToSpreadsheet_(d) {
  try {
    var ssId = String(CFG.SHEET_ID || '').trim();
    if (!ssId) throw new Error('Configure CFG.SHEET_ID with the institution-owned scanner spreadsheet ID.');
    var ss = SpreadsheetApp.openById(ssId);

    var ds = ss.getSheetByName(SCANNER_CONFIG.MAIN_SHEET_NAME);
    if (!ds) {
      ds = ss.insertSheet(SCANNER_CONFIG.MAIN_SHEET_NAME);
      var h = ['File Name', 'Processing Date', 'Title', 'Phone Number', 'Email', 'Institution', 'Study Period', 'Population', 'Inclusion Criteria', 'Exclusion Criteria', 'Sample Size', 'Sampling Technique', 'Data Collection', 'Data Analysis', 'Missing Count', 'Missing Sections', 'Document URL'];
      ds.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
      ds.setFrozenRows(1);
    }
    ds.appendRow([
      d.fileName, d.processingDate, d.title, d.phoneNumber, d.email, d.institution,
      d.studyPeriod, d.population, d.inclusionCriteria, d.exclusionCriteria,
      d.sampleSize, d.samplingTechnique, d.dataCollection, d.dataAnalysis,
      d.missingCount, d.missingSections, d.docUrl
    ]);

    var cs = ss.getSheetByName(SCANNER_CONFIG.CHECKLIST_SHEET_NAME);
    var keys = Object.keys(SCANNER_CONFIG.SECTIONS);
    if (!cs) {
      cs = ss.insertSheet(SCANNER_CONFIG.CHECKLIST_SHEET_NAME);
      var chH = ['File Name', 'Processing Date'].concat(keys, ['Document URL']);
      cs.getRange(1, 1, 1, chH.length).setValues([chH]).setFontWeight('bold');
      cs.setFrozenRows(1);
      var rg = cs.getRange(2, 3, 1000, keys.length);
      cs.setConditionalFormatRules([
        SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Yes').setFontColor('#0F5132').setBackground('#D1E7DD').setRanges([rg]).build(),
        SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('No').setFontColor('#842029').setBackground('#F8D7DA').setRanges([rg]).build()
      ]);
    }
    cs.appendRow([d.fileName, d.processingDate].concat(keys.map(function(k) { return d.checklist[k]; }), [d.docUrl]));
  } catch (e) {
    console.warn('Logging to Google Sheets failed or running locally:', e.message);
  }
}

/**
 * Deletes file and converted doc from Google Drive.
 */
function deleteFileFromDrive_(storedName) {
  try {
    var folderId = String(CFG.FOLDER_ID || '').trim();
    if (!folderId) throw new Error('Configure CFG.FOLDER_ID with the institution-owned Drive vault folder ID.');
    var folder = DriveApp.getFolderById(folderId);

    var raws = folder.getFilesByName(storedName);
    while (raws.hasNext()) raws.next().setTrashed(true);

    var docName = storedName.replace(/\.(docx?|pdf)$/i, '');
    var docs = folder.getFilesByName(docName);
    while (docs.hasNext()) {
      var f = docs.next();
      if (f.getMimeType() === MimeType.GOOGLE_DOCS) f.setTrashed(true);
    }

    var ssId = String(CFG.SHEET_ID || '').trim();
    if (!ssId) throw new Error('Configure CFG.SHEET_ID with the institution-owned scanner spreadsheet ID.');
    var ss = SpreadsheetApp.openById(ssId);
    [SCANNER_CONFIG.MAIN_SHEET_NAME, SCANNER_CONFIG.CHECKLIST_SHEET_NAME].forEach(function(n) {
      var sh = ss.getSheetByName(n);
      if (!sh) return;
      var d = sh.getDataRange().getValues();
      for (var i = d.length - 1; i >= 1; i--) {
        if (d[i][0] === storedName) sh.deleteRow(i + 1);
      }
    });
    return true;
  } catch (e) {
    throw new Error('Could not delete file: ' + e.message);
  }
}
