// ============================================================================
// Config.gs — Central System Configuration for AAPHREML-IRERC
// Addis Ababa City Administration Health Bureau Institutional Research Ethics Review Committee
// ============================================================================

/**
 * Core System Configuration and Institutional Metadata
 */
var CFG = {
  APP_NAME: 'AAPHREML-IRERC Protocol Management & Ethics Review System',
  ORG_NAME: 'Addis Ababa City Administration Health Bureau (AACAHB)',
  COMMITTEE_NAME: 'AAPHREML Institutional Research Ethics Review Committee (IRERC)',
  INSTITUTIONAL_AUTHORITY: 'Head of Addis Ababa City Administration Health Bureau',
  TIMEZONE: 'Africa/Addis_Ababa',

  // Set these to institution-owned resources before initializing or deploying.
  DB_SS_ID:          '1STOWsef_1jO9wyA1SDjl27fwCNZso7t_2Txqctr96sw',
  ROOT_FOLDER_NAME:  'AAPHREML-IRERC_Documents',
  SHEET_ID:          '1VAOLsmapTnKXtVnONO_O-ZH4H7_KsvQ2VZjTpfH6_dM',
  FOLDER_ID:         '1lx0-ws8XFPUzMmc4s31UKfHUyYNfdoch',

  // GitHub Pages URL for your deployment — update to match your username/repo
  // Example: 'https://YOUR-USERNAME.github.io/aaphreml-irerc/'
  PORTAL_URL:        'https://aardmc.github.io/AAPHREML-IRERC/',
  SHEET_TAB_NAME: 'Initial Protocol',
  ETHICS_QUORUM: 2,

  // Business Rules & Workflows
  PROTOCOL_ID_PREFIX: 'AAPHREML-IRERC',
  PROTOCOL_ID_DIGITS: 4, // e.g. AAPHREML-IRERC-2026-0001
  REVIEW_DEADLINE_DAYS: 7, // Working days given to reviewer
  QUORUM_MINIMUM_MEMBERS: 2, // Minimum IRERC members for ethics quorum
  MAX_FILE_SIZE_MB: 25,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ],
  ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png']
};

/**
 * Standard System User Roles
 */
var ROLES = {
  ADMIN: 'System Administrator',
  SECRETARIAT: 'IRERC Secretary / Administrative Officer',
  CHAIR: 'Chairperson',
  VICE_CHAIR: 'Vice Chairperson',
  REVIEWER: 'IRERC Member / Reviewer',
  INVESTIGATOR: 'Investigator'
};

/**
 * Multidisciplinary Committee Member Categories
 */
var COMMITTEE_CATEGORIES = [
  'Clinical Expert',
  'Public Health Expert',
  'Environmental Health Professional',
  'Laboratory Scientist',
  'Ethics/Legal Expert',
  'Community Representative'
];

/**
 * REQ-4: Maps submission health focus areas to standardized study categories.
 */
var HEALTH_FOCUS_TO_CATEGORY = {
  'Communicable diseases':                              'Biomedical & Laboratory',
  'Non-communicable diseases':                          'Clinical Trial / Interventional',
  'Reproductive, maternal, newborn, and child health':  'Observational / Epidemiological',
  'Food and nutrition':                                 'Public Health & Health Systems',
  'Neglected tropical diseases':                        'Biomedical & Laboratory',
  'Water, Sanitation & Hygiene':                        'Environmental & Occupational Health',
  'Mental health and well-being':                       'Socio-behavioral & Qualitative',
  'Environmental and workplace health':                 'Environmental & Occupational Health',
  'Health systems and services':                        'Health Systems & Policy',
  'Biomedical / laboratory research':                   'Biomedical & Laboratory'
};

/**
 * REQ-4: Maps study categories to the most appropriate committee professional expertise
 * for automatic reviewer recommendation.
 */
var CATEGORY_TO_COMMITTEE_EXPERTISE = {
  'Biomedical & Laboratory':             'Laboratory Scientist',
  'Clinical Trial / Interventional':     'Clinical Expert',
  'Observational / Epidemiological':     'Public Health Expert',
  'Public Health & Health Systems':      'Public Health Expert',
  'Environmental & Occupational Health': 'Environmental Health Professional',
  'Health Systems & Policy':             'Public Health Expert',
  'Socio-behavioral & Qualitative':      'Ethics/Legal Expert'
};

/**
 * Controlled Protocol Status State Machine
 */
var STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  ADMINISTRATIVE_CHECK: 'Under Administrative Check',
  CORRECTION_REQUIRED: 'Incomplete / Correction Required',
  COMPLETE: 'Submission Complete',
  REVIEW_TYPE_CLASSIFICATION: 'Under Review Type Classification',
  REVIEWER_ASSIGNED: 'Reviewer Assigned',
  UNDER_REVIEW: 'Under Review',
  ASSESSMENT: 'Under Study Assessment',
  IRERC_DECISION: 'Awaiting IRERC Decision',
  PRELIMINARY_DECISION: 'Preliminary Decision Issued',
  FINAL_DECISION: 'Final Decision Approved',
  COMMUNICATED: 'Decision Communicated',
  ARCHIVED: 'Archived',

  // Lifecycle Branches
  AMENDMENT_PENDING: 'Amendment Pending Review',
  CONTINUING_REVIEW_DUE: 'Continuing Review Due',
  CONTINUING_REVIEW_PENDING: 'Continuing Review Pending',
  TERMINATED: 'Protocol Terminated',

  // Post-Clearance Monitoring States
  DATA_COLLECTION_ACTIVE:    'Data Collection Active',
  DATA_COLLECTION_SUSPENDED: 'Data Collection Suspended',
  DATA_COLLECTION_COMPLETE:  'Data Collection Complete',
  CLOSEOUT_SUBMITTED:        'Closeout Report Submitted',
  CLOSEOUT_UNDER_REVIEW:     'Closeout Under Review',
  CLEARANCE_EXPIRED:         'Clearance Expired',
  STUDY_ARCHIVED:            'Study Archived'
};

/**
 * Review Type Classifications
 */
var REVIEW_TYPES = {
  FULL_BOARD: 'Full Board Review',
  EXPEDITED: 'Expedited Review',
  EXEMPTION: 'Exemption Review'
};

/**
 * Protocol Submission Types
 */
var SUBMISSION_TYPES = {
  INITIAL: 'Initial Review Application',
  RESUBMISSION: 'Re-submission of Protocols with Corrections',
  AMENDMENT: 'Protocol Amendment',
  CONTINUING_REVIEW: 'Continuing Review of Approved Protocols',
  TERMINATION: 'Protocol Termination'
};

/**
 * Formal IRERC Decision Outcomes
 */
var DECISIONS = {
  APPROVED: 'Approved',
  APPROVED_WITH_CONDITIONS: 'Approved with Conditions',
  MODIFICATIONS_REQUIRED: 'Modifications Required',
  DEFERRED: 'Deferred',
  NOT_APPROVED: 'Not Approved',
  RETURNED_FOR_CORRECTION: 'Returned for Correction'
};

/**
 * Document Verification Status
 */
var DOC_STATUS = {
  MISSING: 'Missing',
  UPLOADED: 'Uploaded',
  VERIFIED: 'Verified',
  REQUIRES_CORRECTION: 'Requires Correction',
  APPROVED: 'Approved'
};

/**
 * Standard Submission Document Categories
 */
var REQUIRED_DOC_TYPES = [
  { code: 'DOC_PROTOCOL', name: 'Research Protocol', required: true },
  { code: 'DOC_CONSENT', name: 'Informed Consent Form', required: true },
  { code: 'DOC_TOOLS', name: 'Data Collection Tools', required: true },
  { code: 'DOC_PIS', name: 'Participant Information Sheet', required: true },
  { code: 'DOC_CV', name: 'Investigator CV', required: true },
  { code: 'DOC_ETHICS_CERT', name: 'Ethical Training Certificate', required: true },
  { code: 'DOC_BUDGET', name: 'Detailed Budget', required: true },
  { code: 'DOC_TIMELINE', name: 'Study Timeline & Workplan', required: true },
  { code: 'DOC_INST_SUPPORT', name: 'Institutional Support Letter', required: false },
  { code: 'DOC_OTHER', name: 'Other Attachments', required: false }
];

/**
 * Database Relational Table (Sheet) Names
 */
var TABLES = {
  USERS: 'users',
  ROLES: 'roles',
  COMMITTEE_MEMBERS: 'committee_members',
  INVESTIGATORS: 'investigators',
  INSTITUTIONS: 'institutions',
  PROTOCOLS: 'protocols',
  PROTOCOL_DETAILS: 'protocol_details',
  PROTOCOL_ETHICS: 'protocol_ethics_info',
  PROTOCOL_VERSIONS: 'protocol_versions',
  PROTOCOL_DOCUMENTS: 'protocol_documents',
  DOCUMENT_VERSIONS: 'document_versions',
  REVIEWER_ASSIGNMENTS: 'reviewer_assignments',
  ASSESSMENT_FORMS: 'assessment_forms',
  ASSESSMENT_ITEMS: 'assessment_items',
  EXPEDITED_DETERMINATIONS: 'expedited_determinations',
  AMENDMENTS: 'amendments',
  CONTINUING_REVIEWS: 'continuing_reviews',
  TERMINATIONS: 'terminations',
  IRERC_MEETINGS: 'irerc_meetings',
  MEETING_AGENDA_ITEMS: 'meeting_agenda_items',
  MEETING_ATTENDEES: 'meeting_attendees',
  DECISIONS: 'decisions',
  DECISION_CONDITIONS: 'decision_conditions',
  COMMUNICATIONS: 'communications',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
  SYSTEM_SETTINGS: 'system_settings',

  // Post-Clearance Monitoring Tables
  DATA_COLLECTION_REPORTS: 'data_collection_reports',
  STUDY_CLOSEOUTS: 'study_closeouts'
};

/**
 * Standard 20-Point Study Assessment Criteria Template
 */
var STANDARD_ASSESSMENT_ITEMS = [
  { code: 'CRIT_01', section: 'Scientific Justification', question: 'Is the research rationale clearly described and scientifically sound?' },
  { code: 'CRIT_02', section: 'Study Design', question: 'Is the chosen study design appropriate to achieve the stated objectives?' },
  { code: 'CRIT_03', section: 'Sample Size', question: 'Is the sample size calculated with adequate statistical or qualitative justification?' },
  { code: 'CRIT_04', section: 'Inclusion/Exclusion', question: 'Are inclusion and exclusion criteria clearly defined and fair?' },
  { code: 'CRIT_05', section: 'Data Collection', question: 'Are data collection tools and standard operating procedures valid and appropriate?' },
  { code: 'CRIT_06', section: 'Quality Assurance', question: 'Are adequate data verification and quality control mechanisms instituted?' },
  { code: 'CRIT_07', section: 'Informed Consent', question: 'Is the informed consent procedure comprehensive, voluntary, and culturally respectful?' },
  { code: 'CRIT_08', section: 'Local Language', question: 'Are information sheets and consent forms translated accurately into local languages (e.g., Amharic)?' },
  { code: 'CRIT_09', section: 'Risk Minimization', question: 'Are physical, psychological, social, and legal risks identified and minimized?' },
  { code: 'CRIT_10', section: 'Direct Benefits', question: 'Are expected direct and community benefits reasonable relative to anticipated risks?' },
  { code: 'CRIT_11', section: 'Vulnerable Groups', question: 'Are vulnerable populations (children, pregnant women, prisoners) adequately safeguarded?' },
  { code: 'CRIT_12', section: 'Confidentiality', question: 'Are robust procedures in place for data de-identification, secure storage, and privacy?' },
  { code: 'CRIT_13', section: 'Compensation', question: 'Is compensation for travel or time fair and non-coercive?' },
  { code: 'CRIT_14', section: 'Investigator Competence', question: 'Do the investigators have documented qualifications and ethics training certificates?' },
  { code: 'CRIT_15', section: 'Site Suitability', question: 'Are the proposed health facilities or community study sites adequate to support the study?' },
  { code: 'CRIT_16', section: 'Community Impact', question: 'Has community engagement, stakeholder consultation, or local dissemination been planned?' },
  { code: 'CRIT_17', section: 'Conflict of Interest', question: 'Are all potential financial and academic conflicts of interest disclosed and managed?' },
  { code: 'CRIT_18', section: 'Study Timeline', question: 'Is the project timeline feasible given the study scope and recruitment requirements?' },
  { code: 'CRIT_19', section: 'Budget Transparency', question: 'Is the budget itemized and free of coercive financial inducements?' },
  { code: 'CRIT_20', section: 'Regulatory Compliance', question: 'Does the study adhere to national Ethiopian health research guidelines and the Declaration of Helsinki?' }
];
