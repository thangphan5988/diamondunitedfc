/**
 * DUFC Match History API
 * Deploy:
 * 1. Google Sheet -> Extensions -> Apps Script
 * 2. Paste code này vào Code.gs
 * 3. Deploy -> New deployment -> Web app
 * 4. Execute as: Me
 * 5. Who has access: Anyone
 * 6. Copy Web App URL, dán vào MATCH_HISTORY_WEB_APP_URL trong file HTML.
 *
 * Actions:
 *   POST save_match_history  — lưu lineup sau xuất ảnh
 *   POST save_match_result   — lưu kết quả + cập nhật rating roster
 *   GET  get_match_list      — danh sách trận đã hoàn tất
 *   GET  get_match_detail    — chi tiết 1 trận
 */

const SPREADSHEET_ID = "1Ffv-98Ld8jW2AKu-1NmGXFbhsuWJogw83F5p0q0HRGU";
const TARGET_GID = 228928781;
const ROSTER_GID = 545791527;
const APP_VERSION = "v1.16.0";

const MATCH_SUMMARY_SHEET = "Match Summary";
const RATING_LOG_SHEET = "Rating Log";
const ADMIN_USERS_SHEET = "Admin Users";
const ADMIN_SESSIONS_SHEET = "Admin Sessions";
const AUTH_PEPPER = "dufc-auth-pepper-v1";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ADMIN_USERS_HEADERS = [
  "username",
  "password_hash",
  "display_name",
  "permissions",
  "active"
];

const ADMIN_SESSIONS_HEADERS = [
  "token",
  "username",
  "permissions",
  "expires_at",
  "created_at"
];

const HEADERS = [
  "match_id",
  "match_date",
  "created_at",
  "team",
  "shirt",
  "formation",
  "player_name",
  "rating",
  "starter",
  "lineup_order",
  "assigned_position",
  "assigned_side",
  "main_position",
  "secondary_positions",
  "preferred_side",
  "fit_label",
  "captain",
  "image_filename"
];

const EXTRA_HEADERS = [
  "status",
  "team_a_score",
  "team_b_score",
  "match_score",
  "goals",
  "assists",
  "is_mvp",
  "rating_before",
  "rating_delta",
  "rating_after",
  "result_saved_at"
];

const MATCH_SUMMARY_HEADERS = [
  "match_id",
  "match_label",
  "match_date",
  "created_at",
  "match_type",
  "opponent_name",
  "formation_a",
  "formation_b",
  "team_a_score",
  "team_b_score",
  "mvp_players",
  "player_count",
  "status",
  "image_filename",
  "result_saved_at"
];

const RATING_LOG_HEADERS = [
  "match_id",
  "match_date",
  "player_name",
  "match_score",
  "rating_before",
  "rating_delta",
  "rating_after",
  "is_mvp",
  "mvp_count_before",
  "mvp_count_after",
  "saved_at"
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const action = String(payload.action || "save_match_history").trim();

    switch (action) {
      case "save_match_history":
        return jsonResponse(saveMatchHistory_(payload));
      case "save_match_result":
        return jsonResponse(saveMatchResult_(payload));
      case "cancel_match":
        return jsonResponse(cancelMatch_(payload));
      case "admin_login":
        return jsonResponse(adminLogin_(payload));
      case "admin_logout":
        return jsonResponse(adminLogout_(payload));
      case "admin_save_user":
        return jsonResponse(adminSaveUser_(payload));
      case "admin_delete_user":
        return jsonResponse(adminDeleteUser_(payload));
      default:
        return jsonResponse({ ok: false, error: "Invalid action: " + action });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || "").trim();

  if (action) {
    try {
      switch (action) {
        case "get_match_list":
          return jsonResponse(getMatchList_(params));
        case "get_match_detail":
          return jsonResponse(getMatchDetail_(params));
        case "get_pending_match":
          return jsonResponse(getPendingMatch_(params));
        case "get_latest_lineup":
          return jsonResponse(getLatestLineup_(params));
        case "admin_validate_session":
          return jsonResponse(adminValidateSession_(params));
        case "admin_list_users":
          return jsonResponse(adminListUsers_(params));
        default:
          return jsonResponse({ ok: false, error: "Invalid action: " + action });
      }
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err) });
    }
  }

  return jsonResponse({
    ok: true,
    service: "DUFC Match History API",
    version: APP_VERSION,
    spreadsheet_id: SPREADSHEET_ID,
    target_gid: TARGET_GID,
    mode: "replace_same_match_date_pending_only",
    actions: ["save_match_history", "save_match_result", "cancel_match", "admin_login", "admin_logout", "admin_save_user", "admin_delete_user", "get_match_list", "get_match_detail", "get_pending_match", "get_latest_lineup", "admin_validate_session", "admin_list_users"],
    updated_at: "2026-06-10"
  });
}

function saveMatchHistory_(payload) {
  requireAuth_(payload, ["export", "lineup_internal", "lineup_cap"]);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheetByGid_(ss, TARGET_GID);
  if (!sheet) {
    return { ok: false, error: "Target sheet gid not found: " + TARGET_GID };
  }

  ensureMatchHistoryHeaders_(sheet);

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) {
    return { ok: false, error: "No rows" };
  }

  const matchId = String(payload.match_id || "").trim();
  if (!matchId) {
    return { ok: false, error: "match_id is required" };
  }

  // DUFC rule (cập nhật v1.12):
  // Cùng ngày export lại => xóa dòng pending (lineup_exported / chưa có status).
  // KHÔNG xóa trận đã completed.
  const matchDate = String(rows[0].match_date || "").trim();
  const deletedRows = matchDate ? deleteRowsByMatchDate_(sheet, matchDate) : 0;
  const deletedSummary = matchDate ? deletePendingSummaryByMatchDate_(ss, matchDate) : 0;

  const allHeaders = getMatchHistoryHeaderRow_(sheet);
  const values = rows.map(function(row) {
    return allHeaders.map(function(h) {
      if (h === "status" && (row[h] == null || row[h] === "")) return "lineup_exported";
      const value = row[h];
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
      return value == null ? "" : value;
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, allHeaders.length).setValues(values);
  appendMatchSummary_(ss, payload, rows, matchId);

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_date: matchDate,
    normalized_match_date: normalizeMatchDate_(matchDate),
    deleted_old_rows: deletedRows,
    deleted_pending_summary: deletedSummary,
    inserted_rows: values.length,
    status: "lineup_exported"
  };
}

function saveMatchResult_(payload) {
  requireAuth_(payload, ["match_result"]);
  const matchId = String(payload.match_id || "").trim();
  const teamAScore = Number(payload.team_a_score);
  const teamBScore = Number(payload.team_b_score);
  let players = Array.isArray(payload.players) ? payload.players : [];

  if (!matchId) throw new Error("match_id is required");
  if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore)) {
    throw new Error("team_a_score and team_b_score are required");
  }
  if (!players.length) throw new Error("players is required");

  const matchType = String(payload.match_type || "internal").trim().toLowerCase();
  players = applyTeamMvpRules_(players, matchType);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historySheet = getSheetByGid_(ss, TARGET_GID);
  if (!historySheet) throw new Error("Target sheet gid not found: " + TARGET_GID);

  const summarySheet = getOrCreateSheet_(ss, MATCH_SUMMARY_SHEET, MATCH_SUMMARY_HEADERS);
  const rosterSheet = getSheetByGid_(ss, ROSTER_GID);
  const ratingLogSheet = getOrCreateSheet_(ss, RATING_LOG_SHEET, RATING_LOG_HEADERS);

  ensureMatchHistoryHeaders_(historySheet);
  const allHeaders = getMatchHistoryHeaderRow_(historySheet);
  const hMap = headerIndexMap_(allHeaders);

  const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(summaryHeaders);
  const ratingLogHeaders = ensureSheetHeaders_(ratingLogSheet, RATING_LOG_HEADERS);
  const rMap = headerIndexMap_(ratingLogHeaders);

  let summaryRowIndex = ensureSummaryRowForMatch_(
    ss, summarySheet, sMap, historySheet, hMap, matchId, payload
  );
  const summaryData = summarySheet.getDataRange().getValues();

  const currentStatus = String(summaryData[summaryRowIndex - 1][sMap.status] || "");
  if (currentStatus === "completed") {
    throw new Error("Match already completed and cannot be edited");
  }

  const mvpNames = players
    .filter(function(p) { return !!p.is_mvp; })
    .map(function(p) { return p.player_name; });

  const savedAt = new Date().toISOString();
  const matchDate = String(summaryData[summaryRowIndex - 1][sMap.match_date] || "");

  summarySheet.getRange(summaryRowIndex, sMap.team_a_score + 1).setValue(teamAScore);
  summarySheet.getRange(summaryRowIndex, sMap.team_b_score + 1).setValue(teamBScore);
  summarySheet.getRange(summaryRowIndex, sMap.mvp_players + 1).setValue(mvpNames.join(", "));
  summarySheet.getRange(summaryRowIndex, sMap.status + 1).setValue("completed");
  summarySheet.getRange(summaryRowIndex, sMap.result_saved_at + 1).setValue(savedAt);
  if (sMap.opponent_name !== undefined) {
    summarySheet.getRange(summaryRowIndex, sMap.opponent_name + 1)
      .setValue(String(payload.opponent_name || "").trim());
  }

  const historyData = historySheet.getDataRange().getValues();
  const playerMap = {};
  players.forEach(function(p) {
    playerMap[normalizeName_(p.player_name)] = p;
  });

  for (let r = 1; r < historyData.length; r++) {
    const rowMatchId = String(historyData[r][hMap.match_id] || "");
    if (rowMatchId !== matchId) continue;

    const playerName = String(historyData[r][hMap.player_name] || "");
    const key = normalizeName_(playerName);
    const item = playerMap[key];
    if (!item) continue;

    const ratingBefore = clampRating_(item.rating_before);
    const matchScore = Number(item.match_score);
    const delta = calcRatingDelta_(matchScore);
    const ratingAfter = clampRating_(ratingBefore + delta);
    const rowNum = r + 1;

    historySheet.getRange(rowNum, hMap.status + 1).setValue("completed");
    historySheet.getRange(rowNum, hMap.team_a_score + 1).setValue(teamAScore);
    historySheet.getRange(rowNum, hMap.team_b_score + 1).setValue(teamBScore);
    historySheet.getRange(rowNum, hMap.match_score + 1).setValue(matchScore);
    if (hMap.goals !== undefined) {
      historySheet.getRange(rowNum, hMap.goals + 1).setValue(clampStatCount_(item.goals));
    }
    if (hMap.assists !== undefined) {
      historySheet.getRange(rowNum, hMap.assists + 1).setValue(clampStatCount_(item.assists));
    }
    historySheet.getRange(rowNum, hMap.is_mvp + 1).setValue(item.is_mvp ? "TRUE" : "FALSE");
    historySheet.getRange(rowNum, hMap.rating_before + 1).setValue(ratingBefore);
    historySheet.getRange(rowNum, hMap.rating_delta + 1).setValue(delta);
    historySheet.getRange(rowNum, hMap.rating_after + 1).setValue(ratingAfter);
    historySheet.getRange(rowNum, hMap.result_saved_at + 1).setValue(savedAt);
  }

  if (rosterSheet) {
    updateRosterRatings_(rosterSheet, players, matchId, matchDate, savedAt, ratingLogSheet, ratingLogHeaders, rMap);
  }

  const matchLabel = String(summaryData[summaryRowIndex - 1][sMap.match_label] || "");

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_label: matchLabel,
    status: "completed",
    mvp_players: mvpNames,
    saved_at: savedAt
  };
}

function getMatchList_(params) {
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 30));
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const summarySheet = getOrCreateSheet_(ss, MATCH_SUMMARY_SHEET, MATCH_SUMMARY_HEADERS);
  const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(summaryHeaders);
  const data = summarySheet.getDataRange().getValues();

  const matches = [];
  for (let r = data.length - 1; r >= 1; r--) {
    const status = String(data[r][sMap.status] || "");
    if (status !== "completed") continue;
    matches.push({
      match_id: data[r][sMap.match_id],
      match_label: data[r][sMap.match_label],
      match_date: data[r][sMap.match_date],
      match_type: data[r][sMap.match_type],
      opponent_name: data[r][sMap.opponent_name],
      team_a_score: data[r][sMap.team_a_score],
      team_b_score: data[r][sMap.team_b_score],
      mvp_players: data[r][sMap.mvp_players],
      formation_a: data[r][sMap.formation_a],
      formation_b: data[r][sMap.formation_b],
      player_count: data[r][sMap.player_count],
      image_filename: data[r][sMap.image_filename],
      result_saved_at: data[r][sMap.result_saved_at]
    });
    if (matches.length >= limit) break;
  }

  return { ok: true, version: APP_VERSION, matches: matches };
}

function getPendingMatch_(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const summarySheet = ss.getSheetByName(MATCH_SUMMARY_SHEET);
  let matchId = "";

  if (summarySheet && summarySheet.getLastRow() > 1) {
    const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
    const sMap = headerIndexMap_(summaryHeaders);
    const data = summarySheet.getDataRange().getValues();

    for (let r = data.length - 1; r >= 1; r--) {
      const status = String(data[r][sMap.status] || "").trim().toLowerCase();
      if (status === "lineup_exported") {
        matchId = String(data[r][sMap.match_id] || "").trim();
        break;
      }
    }
  }

  if (!matchId) {
    const historySheet = getSheetByGid_(ss, TARGET_GID);
    if (historySheet && historySheet.getLastRow() > 1) {
      ensureMatchHistoryHeaders_(historySheet);
      const allHeaders = getMatchHistoryHeaderRow_(historySheet);
      const hMap = headerIndexMap_(allHeaders);
      const historyData = historySheet.getDataRange().getValues();
      let latestCreated = "";

      for (let r = 1; r < historyData.length; r++) {
        const status = String(historyData[r][hMap.status] || "").trim().toLowerCase();
        if (status === "completed") continue;
        const createdAt = String(historyData[r][hMap.created_at] || "");
        const rowMatchId = String(historyData[r][hMap.match_id] || "").trim();
        if (!rowMatchId) continue;
        if (!latestCreated || createdAt > latestCreated) {
          latestCreated = createdAt;
          matchId = rowMatchId;
        }
      }
    }
  }

  if (!matchId) {
    return { ok: true, version: APP_VERSION, pending: false };
  }

  const detail = getMatchDetail_( { match_id: matchId } );
  const status = String(detail.summary && detail.summary.status || "lineup_exported").trim().toLowerCase();
  detail.pending = status !== "completed";
  return detail;
}

function getMatchDetail_(params) {
  const matchId = String(params.match_id || "").trim();
  if (!matchId) throw new Error("match_id is required");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const summarySheet = getOrCreateSheet_(ss, MATCH_SUMMARY_SHEET, MATCH_SUMMARY_HEADERS);
  const historySheet = getSheetByGid_(ss, TARGET_GID);
  if (!historySheet) throw new Error("Target sheet gid not found: " + TARGET_GID);

  const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(summaryHeaders);
  const summaryData = summarySheet.getDataRange().getValues();

  const summaryDisplay = summarySheet.getDataRange().getDisplayValues();
  let summary = null;
  for (let r = 1; r < summaryData.length; r++) {
    if (String(summaryData[r][sMap.match_id]) === matchId) {
      summary = {
        match_id: summaryData[r][sMap.match_id],
        match_label: summaryDisplay[r][sMap.match_label],
        match_date: summaryDisplay[r][sMap.match_date],
        created_at: summaryData[r][sMap.created_at],
        match_type: summaryData[r][sMap.match_type],
        opponent_name: summaryData[r][sMap.opponent_name],
        formation_a: summaryDisplay[r][sMap.formation_a],
        formation_b: summaryDisplay[r][sMap.formation_b],
        team_a_score: summaryData[r][sMap.team_a_score],
        team_b_score: summaryData[r][sMap.team_b_score],
        mvp_players: summaryData[r][sMap.mvp_players],
        player_count: summaryData[r][sMap.player_count],
        status: summaryData[r][sMap.status],
        image_filename: summaryData[r][sMap.image_filename],
        result_saved_at: summaryData[r][sMap.result_saved_at]
      };
      break;
    }
  }
  if (!summary) throw new Error("Match not found: " + matchId);

  ensureMatchHistoryHeaders_(historySheet);
  const allHeaders = getMatchHistoryHeaderRow_(historySheet);
  const hMap = headerIndexMap_(allHeaders);
  const historyData = historySheet.getDataRange().getValues();
  const players = [];

  for (let r = 1; r < historyData.length; r++) {
    if (String(historyData[r][hMap.match_id] || "") !== matchId) continue;
    players.push({
      team: historyData[r][hMap.team],
      shirt: historyData[r][hMap.shirt],
      player_name: historyData[r][hMap.player_name],
      starter: historyData[r][hMap.starter],
      assigned_position: historyData[r][hMap.assigned_position],
      assigned_side: historyData[r][hMap.assigned_side],
      main_position: historyData[r][hMap.main_position],
      fit_label: historyData[r][hMap.fit_label],
      lineup_order: historyData[r][hMap.lineup_order],
      rating: historyData[r][hMap.rating],
      match_score: historyData[r][hMap.match_score],
      goals: historyData[r][hMap.goals],
      assists: historyData[r][hMap.assists],
      is_mvp: historyData[r][hMap.is_mvp],
      rating_before: historyData[r][hMap.rating_before],
      rating_delta: historyData[r][hMap.rating_delta],
      rating_after: historyData[r][hMap.rating_after],
      captain: historyData[r][hMap.captain]
    });
  }

  return { ok: true, version: APP_VERSION, summary: summary, players: players };
}

function ensureSummaryRowForMatch_(ss, summarySheet, sMap, historySheet, hMap, matchId, payload) {
  const summaryData = summarySheet.getDataRange().getValues();

  for (let r = 1; r < summaryData.length; r++) {
    if (String(summaryData[r][sMap.match_id]) === matchId) return r + 1;
  }

  const matchLabel = String((payload && payload.match_label) || "").trim();
  if (matchLabel) {
    for (let r = 1; r < summaryData.length; r++) {
      if (String(summaryData[r][sMap.match_label]) === matchLabel &&
          String(summaryData[r][sMap.status] || "") !== "completed") {
        summarySheet.getRange(r + 1, sMap.match_id + 1).setValue(matchId);
        return r + 1;
      }
    }
  }

  const historyData = historySheet.getDataRange().getValues();
  let firstRow = null;
  let rowCount = 0;
  let formationA = String((payload && payload.formation_a) || "");
  let formationB = String((payload && payload.formation_b) || "");
  let matchType = String((payload && payload.match_type) || "");
  let hasTeamA = false;
  let hasTeamB = false;
  let hasTeamCap = false;

  for (let r = 1; r < historyData.length; r++) {
    if (String(historyData[r][hMap.match_id]) !== matchId) continue;
    rowCount++;
    if (!firstRow) firstRow = historyData[r];
    const team = String(historyData[r][hMap.team] || "").trim().toUpperCase();
    const formation = String(historyData[r][hMap.formation] || "");
    if (team === "A") {
      hasTeamA = true;
      if (formation) formationA = formationA || formation;
    }
    if (team === "B") {
      hasTeamB = true;
      if (formation) formationB = formationB || formation;
    }
    if (team === "CAP" || team === "MAIN" || team === "SUB") {
      hasTeamCap = true;
      if (team === "MAIN" || team === "CAP") {
        if (formation) formationA = formationA || formation;
      }
      if (team === "SUB") {
        if (formation) formationB = formationB || formation;
      }
    }
  }

  if (!matchType) {
    matchType = (hasTeamCap || (hasTeamA && !hasTeamB)) ? "cap" : "internal";
  }

  if (!firstRow || !rowCount) {
    throw new Error(
      "Không tìm thấy trận " + matchId +
      ". Vui lòng xuất ảnh đội hình lại để tạo trận mới."
    );
  }

  const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const freshMap = headerIndexMap_(summaryHeaders);
  const line = summaryHeaders.map(function() { return ""; });
  line[freshMap.match_id] = matchId;
  line[freshMap.match_label] = matchLabel;
  line[freshMap.match_date] = firstRow[hMap.match_date];
  line[freshMap.created_at] = firstRow[hMap.created_at] || new Date().toISOString();
  line[freshMap.match_type] = matchType || "internal";
  line[freshMap.opponent_name] = String((payload && payload.opponent_name) || "");
  line[freshMap.formation_a] = formationA;
  line[freshMap.formation_b] = formationB;
  line[freshMap.player_count] = rowCount;
  line[freshMap.status] = "lineup_exported";
  line[freshMap.image_filename] = firstRow[hMap.image_filename] || "";
  summarySheet.appendRow(line);
  return summarySheet.getLastRow();
}

function appendMatchSummary_(ss, payload, rows, matchId) {
  const summarySheet = getOrCreateSheet_(ss, MATCH_SUMMARY_SHEET, MATCH_SUMMARY_HEADERS);
  const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(summaryHeaders);
  const first = rows[0] || {};
  const line = summaryHeaders.map(function() { return ""; });

  line[sMap.match_id] = matchId;
  line[sMap.match_label] = payload.match_label || "";
  line[sMap.match_date] = first.match_date || "";
  line[sMap.created_at] = first.created_at || new Date().toISOString();
  line[sMap.match_type] = String(payload.match_type || "internal");
  line[sMap.opponent_name] = String(payload.opponent_name || "");
  line[sMap.formation_a] = String(payload.formation_a || "");
  line[sMap.formation_b] = String(payload.formation_b || "");
  line[sMap.player_count] = rows.length;
  line[sMap.status] = "lineup_exported";
  line[sMap.image_filename] = first.image_filename || "";
  const newRow = summarySheet.getLastRow() + 1;
  summarySheet.appendRow(line);
  summarySheet.getRange(newRow, sMap.formation_a + 1, 1, 2).setNumberFormat("@");
}

function deletePendingSummaryByMatchDate_(ss, matchDate) {
  const summarySheet = ss.getSheetByName(MATCH_SUMMARY_SHEET);
  if (!summarySheet || summarySheet.getLastRow() <= 1) return 0;

  const target = normalizeMatchDate_(matchDate);
  if (!target) return 0;

  const headers = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(headers);
  const data = summarySheet.getDataRange().getValues();
  const rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    const rowDate = normalizeMatchDate_(data[i][sMap.match_date]);
    const status = String(data[i][sMap.status] || "").trim().toLowerCase();
    if (rowDate === target && status !== "completed") {
      rowsToDelete.push(i + 1);
    }
  }

  rowsToDelete.reverse().forEach(function(rowNumber) {
    summarySheet.deleteRow(rowNumber);
  });

  return rowsToDelete.length;
}

function applyTeamMvpRules_(players, matchType) {
  const type = String(matchType || "internal").trim().toLowerCase();
  const mvpKeys = {};

  if (type === "cap") {
    if (!players.length) return players;
    let maxScore = -1;
    players.forEach(function(p) {
      const s = Number(p.match_score);
      if (Number.isFinite(s) && s > maxScore) maxScore = s;
    });
    const tied = players.filter(function(p) {
      return Number(p.match_score) === maxScore;
    });
    tied.sort(function(a, b) {
      const aStarter = a.starter === true || String(a.starter).toUpperCase() === "TRUE";
      const bStarter = b.starter === true || String(b.starter).toUpperCase() === "TRUE";
      if (aStarter !== bStarter) return aStarter ? -1 : 1;
      return String(a.player_name || "").localeCompare(String(b.player_name || ""), "vi");
    });
    if (tied.length) {
      mvpKeys[normalizeName_(tied[0].player_name)] = true;
    }
    return players.map(function(p) {
      const next = Object.assign({}, p);
      next.is_mvp = !!mvpKeys[normalizeName_(p.player_name)];
      return next;
    });
  }

  const teams = ["A", "B"];

  teams.forEach(function(team) {
    const list = players.filter(function(p) {
      return String(p.team || "").trim().toUpperCase() === team;
    });
    if (!list.length) return;

    let maxScore = -1;
    list.forEach(function(p) {
      const s = Number(p.match_score);
      if (Number.isFinite(s) && s > maxScore) maxScore = s;
    });

    const tied = list.filter(function(p) {
      return Number(p.match_score) === maxScore;
    });

    tied.sort(function(a, b) {
      const aStarter = a.starter === true || String(a.starter).toUpperCase() === "TRUE";
      const bStarter = b.starter === true || String(b.starter).toUpperCase() === "TRUE";
      if (aStarter !== bStarter) return aStarter ? -1 : 1;
      return String(a.player_name || "").localeCompare(String(b.player_name || ""), "vi");
    });

    if (tied.length) {
      mvpKeys[normalizeName_(tied[0].player_name)] = true;
    }
  });

  return players.map(function(p) {
    const next = Object.assign({}, p);
    next.is_mvp = !!mvpKeys[normalizeName_(p.player_name)];
    return next;
  });
}

function ensureRosterMvpCountColumn_(rosterSheet, rosterHeaders) {
  let mvpCountCol = findColumn_(rosterHeaders, ["mvp_count", "mvp", "so_mvp", "số mvp"]);
  if (mvpCountCol !== -1) return mvpCountCol;

  const newCol = rosterHeaders.length + 1;
  rosterSheet.getRange(1, newCol).setValue("mvp_count");
  const lastRow = rosterSheet.getLastRow();
  if (lastRow > 1) {
    rosterSheet.getRange(2, newCol, lastRow - 1, 1).setValue(0);
  }
  return newCol - 1;
}

function updateRosterRatings_(rosterSheet, players, matchId, matchDate, savedAt, ratingLogSheet, ratingLogHeaders, rMap) {
  const rosterData = rosterSheet.getDataRange().getValues();
  if (rosterData.length < 2) return;

  const rosterHeaders = rosterData[0].map(function(h) {
    return String(h || "").trim().toLowerCase();
  });
  const nameCol = findColumn_(rosterHeaders, ["name", "tên", "ten"]);
  const ratingCol = findColumn_(rosterHeaders, ["rating", "điểm", "diem"]);
  if (nameCol === -1 || ratingCol === -1) {
    throw new Error("Roster sheet missing name/rating columns");
  }

  const mvpCountCol = ensureRosterMvpCountColumn_(rosterSheet, rosterHeaders);
  const freshData = rosterSheet.getDataRange().getValues();

  const updates = {};
  players.forEach(function(p) {
    const ratingBefore = clampRating_(p.rating_before);
    const delta = calcRatingDelta_(Number(p.match_score));
    const ratingAfter = clampRating_(ratingBefore + delta);
    const mvpCountBefore = Math.max(0, Math.round(Number(p.mvp_count_before) || 0));
    updates[normalizeName_(p.player_name)] = {
      player_name: p.player_name,
      match_score: Number(p.match_score),
      rating_before: ratingBefore,
      rating_delta: delta,
      rating_after: ratingAfter,
      is_mvp: !!p.is_mvp,
      mvp_count_before: mvpCountBefore,
      mvp_count_after: mvpCountBefore + (p.is_mvp ? 1 : 0)
    };
  });

  for (let r = 1; r < freshData.length; r++) {
    const key = normalizeName_(freshData[r][nameCol]);
    const item = updates[key];
    if (!item) continue;
    rosterSheet.getRange(r + 1, ratingCol + 1).setValue(item.rating_after);
    if (item.is_mvp) {
      const currentMvp = Math.max(0, Math.round(Number(freshData[r][mvpCountCol]) || item.mvp_count_before));
      rosterSheet.getRange(r + 1, mvpCountCol + 1).setValue(currentMvp + 1);
      item.mvp_count_after = currentMvp + 1;
    } else {
      const currentMvp = Math.max(0, Math.round(Number(freshData[r][mvpCountCol]) || item.mvp_count_before));
      item.mvp_count_after = currentMvp;
    }
  }

  Object.keys(updates).forEach(function(key) {
    const item = updates[key];
    const line = ratingLogHeaders.map(function() { return ""; });
    line[rMap.match_id] = matchId;
    line[rMap.match_date] = matchDate;
    line[rMap.player_name] = item.player_name;
    line[rMap.match_score] = item.match_score;
    line[rMap.rating_before] = item.rating_before;
    line[rMap.rating_delta] = item.rating_delta;
    line[rMap.rating_after] = item.rating_after;
    line[rMap.is_mvp] = item.is_mvp ? "TRUE" : "FALSE";
    if (rMap.mvp_count_before != null) line[rMap.mvp_count_before] = item.mvp_count_before;
    if (rMap.mvp_count_after != null) line[rMap.mvp_count_after] = item.mvp_count_after;
    line[rMap.saved_at] = savedAt;
    ratingLogSheet.appendRow(line);
  });
}

function ensureMatchHistoryHeaders_(sheet) {
  ensureHeaders_(sheet);
  appendMissingHeaders_(sheet, EXTRA_HEADERS);
}

function getMatchHistoryHeaderRow_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length + EXTRA_HEADERS.length);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h || "").trim(); });
}

function appendMissingHeaders_(sheet, requiredHeaders) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h || "").trim(); });

  const missing = requiredHeaders.filter(function(h) {
    return existing.indexOf(h) === -1;
  });
  if (!missing.length) return existing;

  const startCol = existing.length + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  return existing.concat(missing);
}

function ensureSheetHeaders_(sheet, requiredHeaders) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h || "").trim(); });

  const hasHeader = existing.some(function(v) { return v !== ""; });
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return requiredHeaders.slice();
  }

  return appendMissingHeaders_(sheet, requiredHeaders);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  } else {
    ensureSheetHeaders_(sheet, headers);
  }
  return sheet;
}

function getSheetByGid_(ss, gid) {
  return ss.getSheets().find(function(s) {
    return s.getSheetId() === Number(gid);
  });
}

function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeader = firstRow.some(function(v) {
    return String(v || "").trim() !== "";
  });

  if (!hasHeader) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const current = firstRow.map(function(v) { return String(v || "").trim(); });
  const same = HEADERS.every(function(h, i) { return current[i] === h; });
  if (!same) {
    sheet.insertRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function normalizeMatchDate_(value) {
  if (value == null || value === "") return "";

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const s = String(value).trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = iso[1];
    const m = String(Number(iso[2])).padStart(2, "0");
    const d = String(Number(iso[3])).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  const vn = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (vn) {
    const d = String(Number(vn[1])).padStart(2, "0");
    const m = String(Number(vn[2])).padStart(2, "0");
    const y = vn[3];
    return y + "-" + m + "-" + d;
  }

  return s.toLowerCase();
}

function findHeaderColumn_(headers, headerName, fallbackIndex) {
  const normalized = headers.map(function(h) {
    return String(h || "").trim().toLowerCase();
  });
  const idx = normalized.indexOf(headerName.toLowerCase());
  return idx >= 0 ? idx + 1 : fallbackIndex;
}

function cancelMatch_(payload) {
  requireAuth_(payload, ["cancel_match"]);
  const matchId = String(payload.match_id || "").trim();
  if (!matchId) throw new Error("match_id is required");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historySheet = getSheetByGid_(ss, TARGET_GID);
  if (!historySheet) throw new Error("Target sheet gid not found: " + TARGET_GID);

  const summarySheet = ss.getSheetByName(MATCH_SUMMARY_SHEET);
  if (summarySheet && summarySheet.getLastRow() > 1) {
    const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
    const sMap = headerIndexMap_(summaryHeaders);
    const summaryData = summarySheet.getDataRange().getValues();
    for (let r = 1; r < summaryData.length; r++) {
      if (String(summaryData[r][sMap.match_id]) !== matchId) continue;
      const status = String(summaryData[r][sMap.status] || "").trim().toLowerCase();
      if (status === "completed") {
        throw new Error("Trận đã hoàn tất, không thể hủy.");
      }
      break;
    }
  }

  ensureMatchHistoryHeaders_(historySheet);
  const deletedHistory = deleteRowsByMatchId_(historySheet, matchId);
  const deletedSummary = deleteSummaryByMatchId_(ss, matchId);

  if (!deletedHistory && !deletedSummary) {
    throw new Error("Không tìm thấy trận pending để hủy: " + matchId);
  }

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    deleted_history_rows: deletedHistory,
    deleted_summary_rows: deletedSummary,
    status: "cancelled"
  };
}

function deleteRowsByMatchId_(sheet, matchId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const allHeaders = getMatchHistoryHeaderRow_(sheet);
  const hMap = headerIndexMap_(allHeaders);
  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][hMap.match_id] || "") !== matchId) continue;
    const status = String(data[i][hMap.status] || "").trim().toLowerCase();
    if (status === "completed") continue;
    rowsToDelete.push(i + 1);
  }

  rowsToDelete.reverse().forEach(function(rowNumber) {
    sheet.deleteRow(rowNumber);
  });

  return rowsToDelete.length;
}

function deleteSummaryByMatchId_(ss, matchId) {
  const summarySheet = ss.getSheetByName(MATCH_SUMMARY_SHEET);
  if (!summarySheet || summarySheet.getLastRow() <= 1) return 0;

  const headers = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(headers);
  const data = summarySheet.getDataRange().getValues();
  let deleted = 0;

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][sMap.match_id] || "") !== matchId) continue;
    const status = String(data[i][sMap.status] || "").trim().toLowerCase();
    if (status === "completed") {
      throw new Error("Trận đã hoàn tất, không thể hủy.");
    }
    summarySheet.deleteRow(i + 1);
    deleted++;
  }

  return deleted;
}

function deleteRowsByMatchDate_(sheet, matchDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const target = normalizeMatchDate_(matchDate);
  if (!target) return 0;

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    .map(function(h) { return String(h || "").trim(); });

  const matchDateCol = findHeaderColumn_(headers, "match_date", 2);
  const statusCol = findHeaderColumn_(headers, "status", -1);

  const rawValues = sheet.getRange(2, matchDateCol, lastRow - 1, 1).getValues();
  const displayValues = sheet.getRange(2, matchDateCol, lastRow - 1, 1).getDisplayValues();
  const rowsToDelete = [];

  for (let i = 0; i < rawValues.length; i++) {
    const rawNormalized = normalizeMatchDate_(rawValues[i][0]);
    const displayNormalized = normalizeMatchDate_(displayValues[i][0]);

    if (rawNormalized !== target && displayNormalized !== target) continue;

    if (statusCol > 0) {
      const status = String(sheet.getRange(i + 2, statusCol).getDisplayValue() || "")
        .trim()
        .toLowerCase();
      if (status === "completed") continue;
    }

    rowsToDelete.push(i + 2);
  }

  rowsToDelete.reverse().forEach(function(rowNumber) {
    sheet.deleteRow(rowNumber);
  });

  return rowsToDelete.length;
}

function headerIndexMap_(headers) {
  const map = {};
  headers.forEach(function(h, i) { map[h] = i; });
  return map;
}

function normalizeName_(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function calcRatingDelta_(matchScore) {
  const s = Number(matchScore);
  if (!Number.isFinite(s)) return 0;
  if (s >= 8) return 1;
  if (s <= 5) return -1;
  return 0;
}

function clampRating_(rating) {
  return Math.max(1, Math.min(10, Math.round(Number(rating))));
}

function clampStatCount_(value) {
  return Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
}

function findColumn_(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function hashPassword_(password) {
  const raw = AUTH_PEPPER + String(password || "");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

function parsePermissions_(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return [];
  if (raw === "all") return ["all"];
  return raw.split(/[,;|]/).map(function(x) {
    return String(x || "").trim().toLowerCase();
  }).filter(function(x) { return !!x; });
}

function hasPermission_(permissions, required) {
  const list = Array.isArray(permissions) ? permissions : parsePermissions_(permissions);
  if (list.indexOf("all") >= 0) return true;
  const req = Array.isArray(required) ? required : [required];
  for (let i = 0; i < req.length; i++) {
    if (list.indexOf(String(req[i]).toLowerCase()) >= 0) return true;
  }
  return false;
}

function ensureAdminUsersSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, ADMIN_USERS_SHEET, ADMIN_USERS_HEADERS);
  ensureSheetHeaders_(sheet, ADMIN_USERS_HEADERS);
  if (sheet.getLastRow() <= 1) {
    sheet.appendRow([
      "admin",
      hashPassword_("dufc2026"),
      "Admin",
      "all",
      "TRUE"
    ]);
  }
  return sheet;
}

function ensureAdminSessionsSheet_(ss) {
  return getOrCreateSheet_(ss, ADMIN_SESSIONS_SHEET, ADMIN_SESSIONS_HEADERS);
}

function findAdminUser_(ss, username) {
  const sheet = ensureAdminUsersSheet_(ss);
  const headers = ensureSheetHeaders_(sheet, ADMIN_USERS_HEADERS);
  const map = headerIndexMap_(headers);
  const data = sheet.getDataRange().getValues();
  const key = normalizeName_(username);

  for (let r = 1; r < data.length; r++) {
    if (normalizeName_(data[r][map.username]) !== key) continue;
    return {
      rowIndex: r + 1,
      username: String(data[r][map.username] || ""),
      password_hash: String(data[r][map.password_hash] || ""),
      display_name: String(data[r][map.display_name] || ""),
      permissions: parsePermissions_(data[r][map.permissions]),
      active: String(data[r][map.active] || "").toUpperCase() !== "FALSE"
    };
  }
  return null;
}

function createSession_(ss, user) {
  const sheet = ensureAdminSessionsSheet_(ss);
  const headers = ensureSheetHeaders_(sheet, ADMIN_SESSIONS_HEADERS);
  const map = headerIndexMap_(headers);
  const token = Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const line = headers.map(function() { return ""; });
  line[map.token] = token;
  line[map.username] = user.username;
  line[map.permissions] = user.permissions.join(",");
  line[map.expires_at] = expiresAt;
  line[map.created_at] = now.toISOString();
  sheet.appendRow(line);
  pruneExpiredSessions_(sheet, map);
  return { token: token, expires_at: expiresAt, permissions: user.permissions };
}

function pruneExpiredSessions_(sheet, map) {
  const data = sheet.getDataRange().getValues();
  const now = Date.now();
  const rows = [];
  for (let r = data.length - 1; r >= 1; r--) {
    const exp = Date.parse(String(data[r][map.expires_at] || ""));
    if (!exp || exp < now) rows.push(r + 1);
  }
  rows.forEach(function(rowNum) { sheet.deleteRow(rowNum); });
}

function getSessionByToken_(ss, token) {
  const clean = String(token || "").trim();
  if (!clean) return null;
  const sheet = ensureAdminSessionsSheet_(ss);
  const headers = ensureSheetHeaders_(sheet, ADMIN_SESSIONS_HEADERS);
  const map = headerIndexMap_(headers);
  const data = sheet.getDataRange().getValues();
  const now = Date.now();

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][map.token] || "") !== clean) continue;
    const expiresAt = Date.parse(String(data[r][map.expires_at] || ""));
    if (!expiresAt || expiresAt < now) return null;
    return {
      token: clean,
      username: String(data[r][map.username] || ""),
      permissions: parsePermissions_(data[r][map.permissions]),
      expires_at: String(data[r][map.expires_at] || "")
    };
  }
  return null;
}

function deleteSessionByToken_(ss, token) {
  const sheet = ensureAdminSessionsSheet_(ss);
  if (!sheet || sheet.getLastRow() <= 1) return;
  const headers = ensureSheetHeaders_(sheet, ADMIN_SESSIONS_HEADERS);
  const map = headerIndexMap_(headers);
  const data = sheet.getDataRange().getValues();
  const clean = String(token || "").trim();
  for (let r = data.length - 1; r >= 1; r--) {
    if (String(data[r][map.token] || "") === clean) {
      sheet.deleteRow(r + 1);
      return;
    }
  }
}

function requireAuth_(payload, requiredPermissions) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const session = getSessionByToken_(ss, payload && payload.session_token);
  if (!session) throw new Error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
  if (!hasPermission_(session.permissions, requiredPermissions)) {
    throw new Error("Tài khoản không có quyền thực hiện thao tác này.");
  }
  return session;
}

function requireAuthFromParams_(params, requiredPermissions) {
  return requireAuth_({ session_token: params && params.session_token }, requiredPermissions);
}

function adminLogin_(payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");
  if (!username || !password) throw new Error("username và password là bắt buộc");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const user = findAdminUser_(ss, username);
  if (!user || !user.active) throw new Error("Sai tên đăng nhập hoặc mật khẩu.");
  if (user.password_hash !== hashPassword_(password)) {
    throw new Error("Sai tên đăng nhập hoặc mật khẩu.");
  }

  const session = createSession_(ss, user);
  return {
    ok: true,
    version: APP_VERSION,
    token: session.token,
    expires_at: session.expires_at,
    username: user.username,
    display_name: user.display_name || user.username,
    permissions: session.permissions
  };
}

function adminLogout_(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  deleteSessionByToken_(ss, payload && payload.session_token);
  return { ok: true, version: APP_VERSION };
}

function adminValidateSession_(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const session = getSessionByToken_(ss, params && params.session_token);
  if (!session) return { ok: true, version: APP_VERSION, valid: false };
  const user = findAdminUser_(ss, session.username);
  if (!user || !user.active) return { ok: true, version: APP_VERSION, valid: false };
  return {
    ok: true,
    version: APP_VERSION,
    valid: true,
    username: user.username,
    display_name: user.display_name || user.username,
    permissions: session.permissions,
    expires_at: session.expires_at
  };
}

function adminListUsers_(params) {
  requireAuthFromParams_(params, ["manage_users"]);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensureAdminUsersSheet_(ss);
  const headers = ensureSheetHeaders_(sheet, ADMIN_USERS_HEADERS);
  const map = headerIndexMap_(headers);
  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let r = 1; r < data.length; r++) {
    users.push({
      username: data[r][map.username],
      display_name: data[r][map.display_name],
      permissions: parsePermissions_(data[r][map.permissions]),
      active: String(data[r][map.active] || "").toUpperCase() !== "FALSE"
    });
  }
  return { ok: true, version: APP_VERSION, users: users };
}

function adminSaveUser_(payload) {
  requireAuth_(payload, ["manage_users"]);
  const username = String(payload.username || "").trim();
  if (!username) throw new Error("username is required");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensureAdminUsersSheet_(ss);
  const headers = ensureSheetHeaders_(sheet, ADMIN_USERS_HEADERS);
  const map = headerIndexMap_(headers);
  const existing = findAdminUser_(ss, username);
  const permissions = parsePermissions_(payload.permissions).join(",");
  const displayName = String(payload.display_name || username).trim();
  const active = payload.active === false ? "FALSE" : "TRUE";
  const password = String(payload.password || "");

  if (existing) {
    sheet.getRange(existing.rowIndex, map.display_name + 1).setValue(displayName);
    sheet.getRange(existing.rowIndex, map.permissions + 1).setValue(permissions);
    sheet.getRange(existing.rowIndex, map.active + 1).setValue(active);
    if (password) {
      sheet.getRange(existing.rowIndex, map.password_hash + 1).setValue(hashPassword_(password));
    }
  } else {
    if (!password) throw new Error("Mật khẩu bắt buộc khi tạo tài khoản mới.");
    const line = headers.map(function() { return ""; });
    line[map.username] = username;
    line[map.password_hash] = hashPassword_(password);
    line[map.display_name] = displayName;
    line[map.permissions] = permissions;
    line[map.active] = active;
    sheet.appendRow(line);
  }

  return { ok: true, version: APP_VERSION, username: username };
}

function adminDeleteUser_(payload) {
  const session = requireAuth_(payload, ["manage_users"]);
  const username = String(payload.username || "").trim();
  if (!username) throw new Error("username is required");
  if (normalizeName_(username) === normalizeName_(session.username)) {
    throw new Error("Không thể xóa tài khoản đang đăng nhập.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const user = findAdminUser_(ss, username);
  if (!user) throw new Error("Không tìm thấy tài khoản: " + username);
  const sheet = ss.getSheetByName(ADMIN_USERS_SHEET);
  sheet.deleteRow(user.rowIndex);
  return { ok: true, version: APP_VERSION, username: username };
}

function getLatestLineup_(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const summarySheet = getOrCreateSheet_(ss, MATCH_SUMMARY_SHEET, MATCH_SUMMARY_HEADERS);
  const summaryHeaders = ensureSheetHeaders_(summarySheet, MATCH_SUMMARY_HEADERS);
  const sMap = headerIndexMap_(summaryHeaders);
  const data = summarySheet.getDataRange().getValues();
  let best = null;

  for (let r = 1; r < data.length; r++) {
    const matchId = String(data[r][sMap.match_id] || "").trim();
    if (!matchId) continue;
    const status = String(data[r][sMap.status] || "").trim().toLowerCase();
    if (status === "cancelled") continue;
    const createdAt = String(data[r][sMap.created_at] || "");
    const item = { match_id: matchId, created_at: createdAt, status: status };
    if (!best) {
      best = item;
      continue;
    }
    if (createdAt > best.created_at) best = item;
  }

  if (!best) {
    return { ok: true, version: APP_VERSION, found: false, summary: null, players: [] };
  }

  const detail = getMatchDetail_({ match_id: best.match_id });
  detail.found = true;
  return detail;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
