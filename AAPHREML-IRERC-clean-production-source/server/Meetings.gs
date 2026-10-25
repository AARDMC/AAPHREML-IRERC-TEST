// ============================================================================
// Meetings.gs — IRERC Meeting Scheduler, Agendas, Deliberations & Minutes
// ============================================================================

/**
 * Retrieves all scheduled and concluded IRERC meetings.
 */
function getAllMeetings_() {
  requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.VICE_CHAIR, ROLES.REVIEWER, ROLES.ADMIN]);

  var meetings = dbGetAll_(TABLES.IRERC_MEETINGS);
  meetings.sort(function(a, b) {
    return new Date(b.meeting_date) - new Date(a.meeting_date);
  });
  return apiSuccess_(meetings);
}

/**
 * Creates a new IRERC Committee Meeting with an agenda docket.
 */
function scheduleMeeting_(payload) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.ADMIN, ROLES.CHAIR]);

  if (!payload.meeting_date || !payload.venue) {
    return apiError_('Meeting Date and Venue are required.');
  }

  return withTransactionLock_(function() {
    var year = new Date().getFullYear();
    var allMtgs = dbGetAll_(TABLES.IRERC_MEETINGS);
    var nextSeq = allMtgs.length + 1;
    var mtgNumber = payload.meeting_number || ('MTG-' + year + '-' + ('000' + nextSeq).slice(-3));
    var meetingId = 'MTG-' + generateUuid_().substring(0, 8).toUpperCase();
    var nowIso = new Date().toISOString();

    var meetingRecord = {
      meeting_id: meetingId,
      meeting_number: mtgNumber,
      meeting_date: payload.meeting_date,
      meeting_time: payload.meeting_time || '09:00 AM',
      venue: sanitizeString_(payload.venue),
      chairperson_id: payload.chairperson_id || '',
      chairperson_name: payload.chairperson_name || 'Dr. Chairperson',
      secretary_id: user.user_id,
      status: 'Scheduled',
      agenda_summary: sanitizeString_(payload.agenda_summary || ''),
      minutes_text: '',
      minutes_drive_id: '',
      created_at: nowIso
    };

    dbInsert_(TABLES.IRERC_MEETINGS, meetingRecord);

    // Add protocol agenda items if specified
    if (payload.protocols && Array.isArray(payload.protocols)) {
      for (var i = 0; i < payload.protocols.length; i++) {
        var pItem = payload.protocols[i];
        dbInsert_(TABLES.MEETING_AGENDA_ITEMS, {
          agenda_item_id: 'AGD-' + generateUuid_().substring(0, 8).toUpperCase(),
          meeting_id: meetingId,
          protocol_id: pItem.protocol_id,
          sequence_order: i + 1,
          review_type: pItem.review_type || REVIEW_TYPES.FULL_BOARD,
          lead_reviewer_id: pItem.lead_reviewer_id || '',
          lead_reviewer_name: pItem.lead_reviewer_name || '',
          discussion_summary: '',
          meeting_recommendation: 'Pending Discussion',
          responsible_person: '',
          follow_up_date: ''
        });
      }
    }

    logAuditEvent_(
      'MEETING',
      user.user_id,
      user.full_name,
      user.role,
      'MEETING_SCHEDULED',
      '',
      'Scheduled',
      'Scheduled meeting ' + mtgNumber + ' for ' + payload.meeting_date
    );

    createNotification_(
      'COMMITTEE',
      '',
      '',
      'IRERC Meeting Scheduled: ' + mtgNumber,
      'A committee meeting is scheduled for ' + payload.meeting_date + ' at ' + payload.venue + '. Please review assigned agenda protocols.',
      'MEETING'
    );

    return apiSuccess_(meetingRecord, 'IRERC Meeting ' + mtgNumber + ' scheduled.');
  });
}

/**
 * Retrieves full details for a meeting including attendees, agenda items, and decisions.
 */
function getMeetingDetails_(meetingId) {
  var mtg = dbFindById_(TABLES.IRERC_MEETINGS, meetingId);
  if (!mtg) return apiError_('Meeting not found: ' + meetingId);

  var agendaItems = dbFind_(TABLES.MEETING_AGENDA_ITEMS, function(it) {
    return it.meeting_id === meetingId;
  });
  agendaItems.sort(function(a, b) {
    return parseInt(a.sequence_order, 10) - parseInt(b.sequence_order, 10);
  });

  var attendees = dbFind_(TABLES.MEETING_ATTENDEES, function(att) {
    return att.meeting_id === meetingId;
  });

  return apiSuccess_({
    meeting: mtg,
    agenda_items: agendaItems,
    attendees: attendees
  });
}

/**
 * Records deliberation notes, attendance, and concludes meeting.
 */
function concludeMeetingWithDecisions_(payload) {
  var user = requireAuthorizedRole_([ROLES.SECRETARIAT, ROLES.CHAIR, ROLES.ADMIN]);

  if (!payload.meeting_id) return apiError_('Meeting ID is required.');

  return withTransactionLock_(function() {
    var mtg = dbFindById_(TABLES.IRERC_MEETINGS, payload.meeting_id);
    if (!mtg) return apiError_('Meeting not found.');

    var nowIso = new Date().toISOString();

    // Update agenda items discussion and decisions
    if (payload.agenda_updates && Array.isArray(payload.agenda_updates)) {
      for (var i = 0; i < payload.agenda_updates.length; i++) {
        var u = payload.agenda_updates[i];
        if (u.agenda_item_id) {
          dbUpdate_(TABLES.MEETING_AGENDA_ITEMS, u.agenda_item_id, {
            discussion_summary: sanitizeString_(u.discussion_summary || ''),
            meeting_recommendation: u.meeting_recommendation || 'Approved',
            responsible_person: sanitizeString_(u.responsible_person || ''),
            follow_up_date: u.follow_up_date || ''
          });
        }
      }
    }

    // Record Attendance
    if (payload.attendees && Array.isArray(payload.attendees)) {
      for (var j = 0; j < payload.attendees.length; j++) {
        var att = payload.attendees[j];
        dbInsert_(TABLES.MEETING_ATTENDEES, {
          attendance_id: 'ATT-' + generateUuid_().substring(0, 8).toUpperCase(),
          meeting_id: payload.meeting_id,
          member_id: att.member_id,
          member_name: att.member_name,
          attendance_status: att.attendance_status || 'Present',
          coi_recusals: att.coi_recusals || 'None',
          notes: sanitizeString_(att.notes || '')
        });
      }
    }

    // Conclude Meeting
    var updatedMtg = dbUpdate_(TABLES.IRERC_MEETINGS, payload.meeting_id, {
      status: 'Concluded',
      minutes_text: sanitizeString_(payload.minutes_text || ''),
      updated_at: nowIso
    });

    logAuditEvent_(
      'MEETING',
      user.user_id,
      user.full_name,
      user.role,
      'MEETING_CONCLUDED',
      mtg.status,
      'Concluded',
      'Meeting ' + mtg.meeting_number + ' concluded and minutes recorded.'
    );

    return apiSuccess_(updatedMtg, 'Meeting concluded and minutes recorded.');
  });
}
