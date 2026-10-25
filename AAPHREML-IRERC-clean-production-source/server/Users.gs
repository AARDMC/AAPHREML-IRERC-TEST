// ============================================================================
// Users.gs — User Management & Multidisciplinary Committee Roster
// ============================================================================

/**
 * Retrieves all registered users in the system (Admin only)
 */
function getAllUsers_() {
  requireAuthorizedRole_([ROLES.ADMIN, ROLES.SECRETARIAT]);
  var users = dbGetAll_(TABLES.USERS);
  return apiSuccess_(users.map(sanitizeUserForClient_));
}

/**
 * Retrieves the multidisciplinary committee member roster.
 * Investigators receive the public roster only — contact credentials are omitted.
 */
function getCommitteeMembers_() {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  var members = dbGetAll_(TABLES.COMMITTEE_MEMBERS);

  // Strip PII for Investigators — they should not see email or telephone of IRERC staff
  if (user.role === ROLES.INVESTIGATOR) {
    members = members.map(function(m) {
      return {
        member_id:             m.member_id,
        full_name:             m.full_name,
        professional_category: m.professional_category,
        institution:           m.institution,
        position:              m.position,
        committee_role:        m.committee_role,
        coi_status:            m.coi_status,
        is_active:             m.is_active
        // email and telephone intentionally omitted for Investigator role
      };
    });
  }

  return apiSuccess_(members);
}

/**
 * Retrieves all registered Principal Investigators.
 * Secretariat/Chair/Admin see the full roster; Investigators see only their own profile.
 */
function getInvestigators_() {
  var user = getSessionUser_();
  if (!user) return apiError_('Authentication required.');

  var investigators = dbFind_(TABLES.INVESTIGATORS, function(inv) {
    return true;
  });

  // Investigators may only see their own profile (RBAC isolation)
  if (user.role === ROLES.INVESTIGATOR) {
    investigators = investigators.filter(function(inv) {
      return String(inv.email).toLowerCase() === String(user.email).toLowerCase();
    });
  }

  // Enrich with protocol counts
  var protocols = dbGetAll_(TABLES.PROTOCOLS);
  investigators = investigators.map(function(inv) {
    var myProtocols = protocols.filter(function(p) {
      return String(p.pi_email).toLowerCase() === String(inv.email).toLowerCase();
    });
    return Object.assign({}, inv, {
      protocol_count: myProtocols.length,
      protocols: myProtocols.map(function(p) {
        return { protocol_id: p.protocol_id, study_title: p.study_title, current_status: p.current_status, submission_date: p.submission_date };
      })
    });
  });

  return apiSuccess_(investigators);
}

/**
 * Retrieves active reviewers for assignment dropdowns.
 */
function getAvailableReviewers_(studyCategory) {
  var reviewers = dbFind_(TABLES.COMMITTEE_MEMBERS, function(m) {
    return m.is_active && (m.committee_role === ROLES.REVIEWER || m.committee_role === ROLES.CHAIR || m.committee_role === ROLES.VICE_CHAIR);
  });

  // REQ-4: Annotate reviewers with a 'suggested' flag based on study category expertise match
  if (studyCategory && typeof CATEGORY_TO_COMMITTEE_EXPERTISE !== 'undefined' && CATEGORY_TO_COMMITTEE_EXPERTISE[studyCategory]) {
    var idealExpertise = CATEGORY_TO_COMMITTEE_EXPERTISE[studyCategory];
    reviewers = reviewers.map(function(r) {
      return Object.assign({}, r, { suggested: r.professional_category === idealExpertise });
    });
    // Sort: suggested reviewers first
    reviewers.sort(function(a, b) { return (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0); });
  }

  return apiSuccess_(reviewers);
}

/**
 * Registers or updates a committee member with full institutional profile.
 */
function saveCommitteeMember_(memberData) {
  var user = requireAuthorizedRole_([ROLES.ADMIN, ROLES.SECRETARIAT]);

  if (!memberData.full_name || !memberData.email || !memberData.professional_category) {
    return apiError_('Full Name, Email, and Professional Category are required.');
  }

  if (COMMITTEE_CATEGORIES.indexOf(memberData.professional_category) === -1) {
    return apiError_('Invalid Professional Category. Must be one of: ' + COMMITTEE_CATEGORIES.join(', '));
  }

  return withTransactionLock_(function() {
    var email = memberData.email.trim().toLowerCase();

    // 1. Ensure user account exists
    var existingUsers = dbFind_(TABLES.USERS, function(u) {
      return String(u.email).toLowerCase() === email;
    });

    var userId;
    var userRole = memberData.committee_role || ROLES.REVIEWER;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].user_id;
      dbUpdate_(TABLES.USERS, userId, {
        full_name: memberData.full_name,
        role: userRole,
        telephone: memberData.telephone || existingUsers[0].telephone,
        is_active: memberData.is_active !== undefined ? memberData.is_active : true
      });
    } else {
      userId = 'USR-' + generateUuid_().substring(0, 8).toUpperCase();
      if (!memberData.default_password || memberData.default_password.length < 12) {
        return apiError_('Set a unique initial password of at least 12 characters for this committee member.');
      }
      if (!isPasswordUnique_(memberData.default_password)) {
        return apiError_('The initial password must not be used by another account.');
      }
      var defaultPasswordHash = hashPassword_(memberData.default_password);
      dbInsert_(TABLES.USERS, {
        user_id: userId,
        email: email,
        password_hash: defaultPasswordHash,
        full_name: memberData.full_name,
        role: userRole,
        telephone: memberData.telephone || '',
        is_active: true
      });
    }

    // 2. Insert or update committee_members record
    var existingMember = dbFind_(TABLES.COMMITTEE_MEMBERS, function(m) {
      return String(m.email).toLowerCase() === email || (memberData.member_id && m.member_id === memberData.member_id);
    });

    var memberRecord;
    if (existingMember.length > 0) {
      memberRecord = dbUpdate_(TABLES.COMMITTEE_MEMBERS, existingMember[0].member_id, {
        full_name: memberData.full_name,
        professional_category: memberData.professional_category,
        institution: memberData.institution || 'Addis Ababa Health Bureau',
        position: memberData.position || '',
        telephone: memberData.telephone || '',
        committee_role: userRole,
        date_assigned: memberData.date_assigned || formatDateIso_(new Date()),
        coi_status: memberData.coi_status || 'None Declared',
        is_active: memberData.is_active !== undefined ? memberData.is_active : true
      });
      logAuditEvent_(null, user.user_id, user.full_name, user.role, 'UPDATE_COMMITTEE_MEMBER', '', '', 'Updated member: ' + memberData.full_name);
    } else {
      var memberId = 'MBR-' + generateUuid_().substring(0, 8).toUpperCase();
      memberRecord = dbInsert_(TABLES.COMMITTEE_MEMBERS, {
        member_id: memberId,
        user_id: userId,
        full_name: memberData.full_name,
        professional_category: memberData.professional_category,
        institution: memberData.institution || 'Addis Ababa Health Bureau',
        position: memberData.position || '',
        email: email,
        telephone: memberData.telephone || '',
        committee_role: userRole,
        date_assigned: memberData.date_assigned || formatDateIso_(new Date()),
        coi_status: memberData.coi_status || 'None Declared',
        is_active: true
      });
      logAuditEvent_(null, user.user_id, user.full_name, user.role, 'REGISTER_COMMITTEE_MEMBER', '', '', 'Registered new member: ' + memberData.full_name);
    }

    return apiSuccess_(memberRecord, 'Committee member saved successfully.');
  });
}

/**
 * Registers an investigator account.
 */
function registerInvestigator_(invData) {
  if (!invData.full_name || !invData.email || !invData.password) {
    return apiError_('Full Name, Email, and Password are required.');
  }
  if (String(invData.password).length < 12) {
    return apiError_('Password must contain at least 12 characters.');
  }

  var email = invData.email.trim().toLowerCase();
  if (!isValidEmail_(email)) {
    return apiError_('Please enter a valid email address.');
  }

  return withTransactionLock_(function() {
    if (!isPasswordUnique_(invData.password)) {
      return apiError_('The password must not be used by another account.');
    }

    var existingUsers = dbFind_(TABLES.USERS, function(u) {
      return String(u.email).toLowerCase() === email;
    });

    if (existingUsers.length > 0) {
      return apiError_('An account with this email address already exists.');
    }

    var userId = 'USR-' + generateUuid_().substring(0, 8).toUpperCase();
    var passwordHash = hashPassword_(invData.password);

    dbInsert_(TABLES.USERS, {
      user_id: userId,
      email: email,
      password_hash: passwordHash,
      full_name: invData.full_name,
      role: ROLES.INVESTIGATOR,
      telephone: invData.telephone || '',
      is_active: true
    });

    var invId = 'INV-' + generateUuid_().substring(0, 8).toUpperCase();
    var invRecord = dbInsert_(TABLES.INVESTIGATORS, {
      investigator_id: invId,
      user_id: userId,
      full_name: invData.full_name,
      institution_id: invData.institution_id || '',
      institution_name: invData.institution_name || 'Affiliated Institution',
      department: invData.department || '',
      email: email,
      telephone: invData.telephone || '',
      qualification: invData.qualification || '',
      cv_drive_id: ''
    });

    logAuditEvent_(null, userId, invData.full_name, ROLES.INVESTIGATOR, 'INVESTIGATOR_REGISTERED', '', '', 'Investigator self-registered');

    return apiSuccess_(invRecord, 'Investigator account created successfully.');
  });
}
