/* Public latest match + ongoing match view */

function formatHistoryScore(value){
  if(value == null || String(value).trim() === "") return "?";
  const s = String(value).trim().replace(",", ".");
  if(/^\d+$/.test(s)) return String(parseInt(s, 10));
  const f = Number(s);
  if(!Number.isFinite(f) || f < 0) return "?";
  return String(Math.floor(f));
}

const LR_PITCH_MARKINGS = `<div class="halfLine"></div><div class="centerCircle"></div><div class="centerDot"></div><div class="boxTop"></div><div class="boxBottom"></div><div class="goalTop"></div><div class="goalBottom"></div><div class="spotTop"></div><div class="spotBottom"></div>`;

function buildLatestStatMap(historyPlayers){
  const map = new Map();
  (historyPlayers || []).forEach(p => {
    map.set(normalizeName(p.player_name), {
      match_score: p.match_score,
      goals: Number(p.goals) || 0,
      assists: Number(p.assists) || 0,
      is_mvp: p.is_mvp === true || p.is_mvp === "TRUE",
      rating_delta: Number(p.rating_delta),
      rating_before: p.rating_before,
      rating_after: p.rating_after,
      goal_video_url: p.goal_video_url || "",
      goal_video_urls: parseGoalVideoUrlsInput(p.goal_video_urls || p.goal_video_url)
    });
  });
  return map;
}

function latestResultRatingToneClass(score){
  const value = Number(String(score ?? "").replace(",", "."));
  if(!Number.isFinite(value)) return "scoreUnknown";
  if(value >= 8) return "scoreHigh";
  if(value >= 6) return "scoreNormal";
  return "scoreLow";
}

function latestResultFormatScore(score){
  if(score == null || String(score).trim() === "") return "—";
  const value = Number(String(score).replace(",", "."));
  if(Number.isFinite(value)) return value.toFixed(1);
  return String(score);
}

function latestResultRatingDeltaCompactHtml(delta){
  if(!Number.isFinite(delta) || delta === 0) return "";
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  return `<span class="ratingDelta ${deltaClass(delta)}">⭐${sign}</span>`;
}

function latestResultDeltaHtml(delta){
  // Đã gom vào 1 dòng stats trong latestResultPlayerStatsHtml().
  return "";
}

function collectTeamGoalVideoUrls(historyPlayers, side, isCap){
  const urls = [];
  const filtered = (historyPlayers || []).filter(hp => {
    const teamKey = String(hp.team || "").toUpperCase();
    if(side === "a"){
      return isCap
        ? (teamKey === "MAIN" || teamKey === "SUB" || teamKey === "CAP" || teamKey === "A")
        : teamKey === "A";
    }
    if(side === "b") return !isCap && teamKey === "B";
    return false;
  });
  filtered.sort((a, b) => (Number(a.lineup_order) || 999) - (Number(b.lineup_order) || 999));
  filtered.forEach(hp => {
    parseGoalVideoUrlsInput(hp.goal_video_urls || hp.goal_video_url).forEach(url => urls.push(url));
  });
  return urls;
}

function lrTeamGoalVideosColumnHtml(urls, variant){
  if(!urls.length) return "";
  const cols = urls.length >= 7 ? 3 : (urls.length >= 4 ? 2 : 1);
  const colsClass = cols > 1 ? ` lrTeamGoalVideos--cols${cols}` : "";
  const chips = urls.map((url, i) =>
    `<a class="lrGoalVideoChip lrGoalVideoChip--${variant}" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="Bàn ${i + 1}">📹 ${i + 1}</a>`
  ).join("");
  return `<div class="lrTeamGoalVideos lrTeamGoalVideos--${variant}${colsClass}">${chips}</div>`;
}

function latestResultCompactStatsHtml(stat){
  const goals = Number(stat.goals) || 0;
  const assists = Number(stat.assists) || 0;
  const delta = Number(stat.rating_delta);

  // Cái nào = 0 thì ẩn, chỉ hiện các chỉ số thực sự có.
  const items = [];
  if(goals > 0) items.push(`<span class="goals">⚽${goals}</span>`);
  if(assists > 0) items.push(`<span class="assists">🅰️${assists}</span>`);
  const deltaHtml = latestResultRatingDeltaCompactHtml(delta);
  if(deltaHtml) items.push(deltaHtml);

  if(!items.length) return `<div class="lrStatRow lrStatRow--empty"></div>`;
  return `<div class="lrStatRow">${items.join("")}</div>`;
}

function latestResultPlayerStatsHtml(stat){
  return latestResultCompactStatsHtml(stat || {});
}

function latestResultMvpBadgeHtml(){
  return `<div class="lrMvpBadge"><span class="lrMvpBadgeIcon">🏆</span><span class="lrMvpBadgeText">MVP</span></div>`;
}

function latestResultCaptainBadgeHtml(){
  return `<div class="lrCaptainBadge">C</div>`;
}

function latestResultPitchCardHtml(p, teamClass, stat, isCap){
  const mvp = stat.is_mvp ? latestResultMvpBadgeHtml() : "";
  const captain = p.captain ? latestResultCaptainBadgeHtml() : "";
  const captainClass = p.captain ? " captainCard" : "";
  const score = latestResultFormatScore(stat.match_score ?? "—");
  const scoreClass = latestResultRatingToneClass(score);
  const avatar = avatarSrc(p.avatar, p.name);
  return `<div class="lrCard ${teamClass}${captainClass}">
    ${captain}
    ${mvp}
    <img src="${escapeAttr(avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">
    <div class="lrName">${escapeHtml(playerDisplayName(p))}</div>
    <div class="lrScore ${scoreClass}">${escapeHtml(score)}</div>
    ${latestResultPlayerStatsHtml(stat)}
  </div>`;
}

function latestResultBenchCardHtml(p, teamClass, stat, isCap){
  const mvp = stat.is_mvp ? latestResultMvpBadgeHtml() : "";
  const captain = p.captain ? latestResultCaptainBadgeHtml() : "";
  const captainClass = p.captain ? " captainCard" : "";
  const score = latestResultFormatScore(stat.match_score ?? "—");
  const scoreClass = latestResultRatingToneClass(score);
  const avatar = avatarSrc(p.avatar, p.name);
  const capStats = latestResultPlayerStatsHtml(stat);
  return `<div class="lrBenchCard ${teamClass}${captainClass}">
    ${captain}
    ${mvp}
    <img src="${escapeAttr(avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">
    <div class="lrBenchMeta">
      <div class="lrName">${escapeHtml(playerDisplayName(p))}</div>
      <div class="lrScore ${scoreClass}">${escapeHtml(score)}</div>
      ${capStats}
    </div>
  </div>`;
}

function lrSummaryStripHtml(statusChip, detailChip){
  const detail = detailChip ? `<span class="lrSummaryDetail">${detailChip}</span>` : "";
  return `<div class="lrSummaryStrip">${statusChip}${detail}</div>`;
}

function lrCompletedSummaryHtml(){
  return lrSummaryStripHtml(
    `<span class="lrStatusChip done">✓ Trận đã kết thúc</span>`,
    `<span class="lrSummaryDetail lrSummaryDetail--desktop">Kết quả & điểm cầu thủ đã cập nhật</span>`
  );
}

function lmTeamSegHtml(segments){
  if(!segments?.length || segments.length < 2) return "";
  const btns = segments.map((seg, i) =>
    `<button type="button" class="lmSegBtn${i === 0 ? " active" : ""}" data-team="${escapeAttr(seg.id)}">${seg.label}</button>`
  ).join("");
  return `<div class="lmTeamSeg" role="tablist">${btns}</div>`;
}

function wrapLmTeamsSwitchable(segHtml, teamsInnerHtml){
  if(!segHtml) return `<div class="teams lmTeams">${teamsInnerHtml}</div>`;
  return `<div class="lmTeamsWrap">${segHtml}<div class="teams lmTeams lmTeams--switchable">${teamsInnerHtml}</div></div>`;
}

function initLmTeamSwitcher(root){
  if(!root) return;
  const wrap = root.querySelector(".lmTeamsWrap") || (root.classList.contains("lmTeamsWrap") ? root : null);
  if(!wrap) return;

  const seg = wrap.querySelector(".lmTeamSeg");
  const panels = wrap.querySelectorAll(".lmTeamPanel[data-lm-team]");
  if(!seg || panels.length < 2) return;

  const mq = window.matchMedia("(max-width:760px)");

  function apply(){
    const mobile = mq.matches;
    wrap.classList.toggle("lmTeamsWrap--mobile", mobile);
    const visiblePanels = [...panels].filter(p => p.style.display !== "none");
    if(!mobile || visiblePanels.length < 2){
      panels.forEach(p => p.classList.remove("lmTeamHidden"));
      return;
    }
    const active = seg.querySelector(".lmSegBtn.active")?.dataset.team || visiblePanels[0]?.dataset.lmTeam;
    panels.forEach(p => p.classList.toggle("lmTeamHidden", p.dataset.lmTeam !== active));
  }

  if(!wrap._lmSwitcherBound){
    wrap._lmSwitcherBound = true;
    seg.querySelectorAll(".lmSegBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        seg.querySelectorAll(".lmSegBtn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        apply();
      });
    });
  }

  wrap._lmApply = apply;
  if(!window._lmSwitcherMqBound){
    window._lmSwitcherMqBound = true;
    mq.addEventListener("change", () => {
      document.querySelectorAll(".lmTeamsWrap").forEach(w => w._lmApply?.());
    });
  }
  apply();
}

function renderPublicPitchLineup(pitchId, lineup, formation, renderCard){
  if(!lineup?.starters?.length) return;
  const safeFormation = resolveFormation(formation, "3-1-2");
  ensureStarterPositions(lineup, safeFormation);
  const indexByPos = {};
  const pitch = document.getElementById(pitchId);
  if(!pitch) return;

  for(const p of lineup.starters){
    const [x, y] = getStarterCoords(p, indexByPos, safeFormation);
    const el = document.createElement("div");
    el.className = "slot show";
    el.style.left = x + "%";
    el.style.top = y + "%";
    el.style.zIndex = String(Math.round(100 - y));
    el.innerHTML = renderCard(p);
    pitch.appendChild(el);
  }
}

function renderLatestResultLineup(pitchId, lineup, formation, teamClass, statMap, isCap){
  renderPublicPitchLineup(pitchId, lineup, formation, p => {
    const stat = statMap.get(normalizeName(p.name)) || {};
    return latestResultPitchCardHtml(p, teamClass, stat, isCap);
  });
}

function renderPreviewPitchLineup(pitchId, lineup, formation, teamClass){
  renderPublicPitchLineup(pitchId, lineup, formation, p => cardHtml(p, teamClass));
}

function renderLatestResultBench(benchId, bench, teamClass, statMap, isCap){
  const el = document.getElementById(benchId);
  if(!el) return;
  if(!bench?.length){
    el.innerHTML = `<div class="lrBenchEmpty">Không có dự bị</div>`;
    return;
  }
  el.innerHTML = bench.map(p => {
    const stat = statMap.get(normalizeName(p.name)) || {};
    return latestResultBenchCardHtml(p, teamClass, stat, isCap);
  }).join("");
}

function renderPreviewBench(benchId, bench){
  const el = document.getElementById(benchId);
  if(!el) return;
  if(!bench?.length){
    el.innerHTML = `<div class="benchItem">Không có dự bị</div>`;
    return;
  }
  el.innerHTML = bench.map(p =>
    `<div class="benchItem"><span class="benchRating">${p.rating || 5}</span><img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'">${escapeHtml(playerDisplayName(p))} · ${p.main}</div>`
  ).join("");
}

function isHostMatchConfirmed(summary){
  const status = String(summary?.status || "").toLowerCase();
  return status === "lineup_exported" || !!summary?.image_filename;
}

function normalizeMatchDateNormClient(value){
  if(value == null || value === "") return "";
  const s = String(value).trim();
  if(!s) return "";
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso){
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }
  const vn = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(vn){
    return `${vn[3]}-${String(vn[2]).padStart(2, "0")}-${String(vn[1]).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if(!isNaN(d.getTime())){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

function parseMatchKickoffMs(summary){
  const time = normalizeMatchStartTime(summary?.match_start_time);
  let norm = summary?.match_date_norm || normalizeMatchDateNormClient(summary?.match_date);
  if(!norm && summary?.created_at){
    norm = normalizeMatchDateNormClient(summary.created_at);
  }
  if(!norm) return null;
  const kickoff = new Date(`${norm}T${time}:00+07:00`);
  return isNaN(kickoff.getTime()) ? null : kickoff.getTime();
}

function ongoingMatchStatusTitle(summary){
  const hostConfirmed = isHostMatchConfirmed(summary);
  const kickoffMs = parseMatchKickoffMs(summary);
  const atKickoff = kickoffMs != null && Date.now() >= kickoffMs;
  if(hostConfirmed && atKickoff) return "⚽ Trận đấu diễn ra";
  const timeLabel = formatMatchStartTimeLabel(summary?.match_start_time);
  return `⚽ Trận đấu sắp diễn ra · ${timeLabel}`;
}

function isCapMatchSummary(summary){
  return String(summary?.match_type || "").trim().toLowerCase() === "cap";
}

function ongoingMatchPhaseHtml(summary){
  const title = ongoingMatchStatusTitle(summary);
  const kickoffMs = parseMatchKickoffMs(summary);
  const atKickoff = kickoffMs != null && Date.now() >= kickoffMs;
  const chipClass = isHostMatchConfirmed(summary) && atKickoff ? "live" : "wait";
  return lrSummaryStripHtml(`<span class="lrStatusChip ${chipClass}">${escapeHtml(title)}</span>`);
}

function ongoingTeamConfirmBadge(confirmed){
  return confirmed
    ? `<span class="lmConfirmBadge done">✓ Đã chốt</span>`
    : `<span class="lmConfirmBadge pending">⏳ Đang sắp xếp</span>`;
}

function publicMatchTeamPanelHtml(opts){
  const {
    idPrefix, teamLabel, teamColor, formation, pitchSuffix, benchSuffix, showStatus, teamConfirmed, teamKey
  } = opts;
  const pitchId = idPrefix + pitchSuffix;
  const benchId = idPrefix + benchSuffix;
  const badge = showStatus ? ongoingTeamConfirmBadge(!!teamConfirmed) : "";
  const formBadge = formation ? `<span class="lmFormBadge">${escapeHtml(formation)}</span>` : "";
  const formRow = formation ? `<div class="formationControl lmFormDesktop">
      <label>Sơ đồ</label>
      <div class="formationReadonly">${escapeHtml(formation)}</div>
    </div>` : "";
  const teamAttr = teamKey ? ` data-lm-team="${escapeAttr(teamKey)}"` : "";

  return `<div class="lmTeamPanel"${teamAttr}>
    <div class="teamHead">
      <h2 style="color:${teamColor}">${teamLabel}${formBadge}</h2>
      ${badge}
    </div>
    ${formRow}
    <div class="lineupBody">
      <div class="pitchCol">
        <div class="pitch lrPitch" id="${pitchId}">${LR_PITCH_MARKINGS}</div>
      </div>
      <div class="bench benchSide">
        <h3>Dự bị</h3>
        <div id="${benchId}" class="benchList lrBenchList"></div>
      </div>
    </div>
  </div>`;
}

function latestResultScoreBoardHtml(summary, isCap, historyPlayers){
  const a = formatHistoryScore(summary?.team_a_score);
  const b = formatHistoryScore(summary?.team_b_score);
  const teamAUrls = collectTeamGoalVideoUrls(historyPlayers, "a", isCap);
  const teamBUrls = collectTeamGoalVideoUrls(historyPlayers, "b", isCap);
  const highlightUrl = normalizeVideoUrlInput(summary?.highlight_video_url);
  const matchVideoHtml = highlightUrl
    ? `<a class="lrMatchVideoLink" href="${escapeAttr(highlightUrl)}" target="_blank" rel="noopener noreferrer">🎬 Video trận</a>`
    : "";
  const leftVideos = lrTeamGoalVideosColumnHtml(teamAUrls, isCap ? "blue" : "red");
  const rightVideos = lrTeamGoalVideosColumnHtml(teamBUrls, isCap ? "opp" : "yellow");
  const hasVideos = !!(leftVideos || rightVideos || matchVideoHtml);
  const boardClass = `lrScoreBoard lrScoreBoard--hero${hasVideos ? " lrScoreBoard--withVideos" : ""}`;

  const teamAClass = isCap ? "blue" : "red";
  const teamBClass = isCap ? "opp" : "yellow";
  const teamALabel = isCap ? "DUFC" : "🔴 Đội A";
  const teamBLabel = isCap
    ? escapeHtml(String(summary.opponent_name || "Đối thủ"))
    : "🟡 Đội B";

  const teamAScore = `<div class="lrTeamScore ${teamAClass}">
    <span class="lrTeamLabel">${teamALabel}</span>
    <span class="lrScoreNum">${escapeHtml(String(a))}</span>
  </div>`;
  const teamBScore = `<div class="lrTeamScore ${teamBClass}">
    <span class="lrTeamLabel">${teamBLabel}</span>
    <span class="lrScoreNum">${escapeHtml(String(b))}</span>
  </div>`;

  if(hasVideos){
    const matchBlock = matchVideoHtml
      ? `<div class="lrScoreBoardMatch">${matchVideoHtml}</div>`
      : "";
    const centerHtml = `<div class="lrScoreBoardCenter">${matchVideoHtml}<div class="lrVs">VS</div></div>`;
    return `<div class="${boardClass}">
      ${matchBlock}
      <div class="lrScoreBoardSide lrScoreBoardSide--a lrScoreBoardSide--${teamAClass}">
        ${leftVideos}
        ${teamAScore}
      </div>
      ${centerHtml}
      <div class="lrScoreBoardSide lrScoreBoardSide--b lrScoreBoardSide--${teamBClass}">
        ${teamBScore}
        ${rightVideos}
      </div>
    </div>`;
  }

  return `<div class="${boardClass}">
    ${teamAScore}
    <div class="lrVs">VS</div>
    ${teamBScore}
  </div>`;
}

function renderMatchResultView(containerEl, summary, historyPlayers, idPrefix, opts = {}){
  if(!containerEl || !summary || !historyPlayers?.length) return;

  const embed = opts.embed === true;
  const isCap = isCapMatchFromDetail(summary, historyPlayers);
  const statMap = buildLatestStatMap(historyPlayers);
  const result = rebuildLastResultFromDetail(historyPlayers, summary);
  const fMain = resolveFormation(summary.formation_a, "3-1-2");
  const fSub = resolveFormation(summary.formation_b, "3-1-2");

  const completedBar = embed ? "" : lrCompletedSummaryHtml();

  const capResultMeta = `⚽ Trận Cáp · ${escapeHtml(fMain)}`;
  const headerHtml = embed
    ? `<div class="meta">${isCap
        ? capResultMeta
        : `Nội bộ · ${escapeHtml(fMain)} vs ${escapeHtml(fSub)}`}</div>
        ${matchVenueLineHtml()}`
    : `<div class="lrHeader">
        <h3>${escapeHtml(displayMatchLabel(summary))}</h3>
        <div class="meta">${isCap
          ? capResultMeta
          : `Nội bộ · ${escapeHtml(fMain)} vs ${escapeHtml(fSub)}`}</div>
        ${matchVenueLineHtml()}
      </div>`;

  const pMain = idPrefix + "PitchMain";
  const pSub = idPrefix + "PitchSub";
  const pA = idPrefix + "PitchA";
  const pB = idPrefix + "PitchB";
  const bMain = idPrefix + "BenchMain";
  const bSub = idPrefix + "BenchSub";
  const bA = idPrefix + "BenchA";
  const bB = idPrefix + "BenchB";

  if(isCap){
    const lineupMain = result.lineupMain || result.lineupA;
    containerEl.innerHTML = `
      <div class="lmMatchWrap lmMatchWrap--capResult">
      ${headerHtml}
      ${completedBar}
      ${latestResultScoreBoardHtml(summary, true, historyPlayers)}
      <div class="teams lmTeams lmTeamsCapDone">
        ${publicMatchTeamPanelHtml({
          idPrefix, teamLabel: "⚽ Đội hình ra sân", teamColor: "#38bdf8", formation: fMain,
          pitchSuffix: "PitchMain", benchSuffix: "BenchMain", teamKey: "main"
        })}
      </div>
      </div>
    `;
    clearPitch(pMain);
    renderLatestResultLineup(pMain, lineupMain, fMain, "capTeam", statMap, true);
    renderLatestResultBench(bMain, lineupMain.bench || [], "capTeam", statMap, true);
    initLmTeamSwitcher(containerEl);
    return;
  }

  const teamSeg = lmTeamSegHtml([
    {id: "a", label: "🔴 Đội A"},
    {id: "b", label: "🟡 Đội B"}
  ]);
  const teamsHtml = `
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🔴 Đội A", teamColor: "#ef4444", formation: fMain,
        pitchSuffix: "PitchA", benchSuffix: "BenchA", teamKey: "a"
      })}
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🟡 Đội B", teamColor: "#facc15", formation: fSub,
        pitchSuffix: "PitchB", benchSuffix: "BenchB", teamKey: "b"
      })}
  `;
  containerEl.innerHTML = `
    <div class="lmMatchWrap lmMatchWrap--internalResult">
    ${headerHtml}
    ${completedBar}
    ${latestResultScoreBoardHtml(summary, false, historyPlayers)}
    ${wrapLmTeamsSwitchable(teamSeg, teamsHtml)}
    </div>
  `;
  clearPitch(pA);
  clearPitch(pB);
  renderLatestResultLineup(pA, result.lineupA, fMain, "redTeam", statMap, false);
  renderLatestResultLineup(pB, result.lineupB, fSub, "yellowTeam", statMap, false);
  renderLatestResultBench(bA, result.lineupA.bench || [], "redTeam", statMap, false);
  renderLatestResultBench(bB, result.lineupB.bench || [], "yellowTeam", statMap, false);
  initLmTeamSwitcher(containerEl);
}

function renderOngoingMatchView(containerEl, summary, historyPlayers, idPrefix){
  if(!containerEl || !summary || !historyPlayers?.length) return;

  const isCap = isCapMatchFromDetail(summary, historyPlayers);
  const result = rebuildLastResultFromDetail(historyPlayers, summary);
  const fMain = resolveFormation(summary.formation_a, "3-1-2");
  const fSub = resolveFormation(summary.formation_b, "3-1-2");
  const confA = !!summary.team_a_lineup_confirmed;
  const confB = !!summary.team_b_lineup_confirmed;

  const headerHtml = `<div class="lrHeader">
    <h3>${escapeHtml(displayMatchLabel(summary))}</h3>
    <div class="meta">${isCap
      ? `⚽ Trận Cáp · ${escapeHtml(fMain)} / ${escapeHtml(fSub)}`
      : `Nội bộ · ${escapeHtml(fMain)} vs ${escapeHtml(fSub)}`}</div>
    ${matchVenueLineHtml()}
  </div>`;

  const pMain = idPrefix + "PitchMain";
  const pSub = idPrefix + "PitchSub";
  const pA = idPrefix + "PitchA";
  const pB = idPrefix + "PitchB";
  const bMain = idPrefix + "BenchMain";
  const bSub = idPrefix + "BenchSub";
  const bA = idPrefix + "BenchA";
  const bB = idPrefix + "BenchB";

  if(isCap){
    const capSeg = lmTeamSegHtml([
      {id: "main", label: "⚽ Ra sân"},
      {id: "sub", label: "🔄 Phụ"}
    ]);
    const capTeamsHtml = `
        ${publicMatchTeamPanelHtml({
          idPrefix, teamLabel: "⚽ Đội hình ra sân", teamColor: "#38bdf8", formation: fMain,
          pitchSuffix: "PitchMain", benchSuffix: "BenchMain", teamKey: "main",
          showStatus: true, teamConfirmed: confA
        })}
        ${publicMatchTeamPanelHtml({
          idPrefix, teamLabel: "🔄 Đội hình Phụ", teamColor: "#a78bfa", formation: fSub,
          pitchSuffix: "PitchSub", benchSuffix: "BenchSub", teamKey: "sub",
          showStatus: true, teamConfirmed: confB
        })}
    `;
    containerEl.innerHTML = `
      <div class="lmMatchWrap">
      ${headerHtml}
      ${ongoingMatchPhaseHtml(summary)}
      ${wrapLmTeamsSwitchable(capSeg, capTeamsHtml)}
      </div>
    `;
    clearPitch(pMain);
    clearPitch(pSub);
    renderPreviewPitchLineup(pMain, result.lineupMain || result.lineupA, fMain, "capTeam");
    renderPreviewPitchLineup(pSub, result.lineupSub || result.lineupB, fSub, "capSubTeam");
    renderPreviewBench(bMain, (result.lineupMain || result.lineupA).bench || []);
    renderPreviewBench(bSub, (result.lineupSub || result.lineupB).bench || []);
    initLmTeamSwitcher(containerEl);
    return;
  }

  const teamSeg = lmTeamSegHtml([
    {id: "a", label: "🔴 Đội A"},
    {id: "b", label: "🟡 Đội B"}
  ]);
  const teamsHtml = `
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🔴 Đội A", teamColor: "#ef4444", formation: fMain,
        pitchSuffix: "PitchA", benchSuffix: "BenchA", showStatus: true, teamConfirmed: confA, teamKey: "a"
      })}
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🟡 Đội B", teamColor: "#facc15", formation: fSub,
        pitchSuffix: "PitchB", benchSuffix: "BenchB", showStatus: true, teamConfirmed: confB, teamKey: "b"
      })}
  `;
  containerEl.innerHTML = `
    <div class="lmMatchWrap">
    ${headerHtml}
    ${ongoingMatchPhaseHtml(summary)}
    ${wrapLmTeamsSwitchable(teamSeg, teamsHtml)}
    </div>
  `;
  clearPitch(pA);
  clearPitch(pB);
  renderPreviewPitchLineup(pA, result.lineupA, fMain, "redTeam");
  renderPreviewPitchLineup(pB, result.lineupB, fSub, "yellowTeam");
  renderPreviewBench(bA, result.lineupA.bench || []);
  renderPreviewBench(bB, result.lineupB.bench || []);
  initLmTeamSwitcher(containerEl);
}

let latestMatchPollTimer = null;

function renderLatestResult(data){
  const el = document.getElementById("latestResultContent");
  if(!el) return;

  if(!data?.found || !data.summary || !data.players?.length){
    el.innerHTML = `<div class="meta">Chưa có trận đấu nào. Trận đang diễn ra hoặc đã kết thúc sẽ hiển thị tại đây.</div>`;
    return;
  }

  renderMatchResultView(el, data.summary, data.players, "lr");
}

function renderOngoingMatch(el, summary, players){
  if(!el) return;
  renderOngoingMatchView(el, summary, players, "lm");
}

function stopLatestMatchPolling(){
  if(latestMatchPollTimer){
    clearInterval(latestMatchPollTimer);
    latestMatchPollTimer = null;
  }
}

function startLatestMatchPolling(){
  stopLatestMatchPolling();
  latestMatchPollTimer = setInterval(async () => {
    if(!document.getElementById("tabLatest")?.classList.contains("active")) return;
    try{
      const pending = await apiGet("get_pending_match");
      const content = document.getElementById("latestResultContent");
      if(!content) return;
      if(pending?.pending && pending.summary && pending.players?.length){
        renderOngoingMatch(content, pending.summary, pending.players);
        return;
      }
      stopLatestMatchPolling();
      const data = await apiGet("get_latest_result");
      renderLatestResult(data);
    }catch(e){
      console.error("latestMatchPoll:", e);
    }
  }, 5000);
}

async function loadLatestMatch(){
  const el = document.getElementById("latestResultContent");
  if(el) el.innerHTML = `<div class="meta">Đang tải...</div>`;
  try{
    const pending = await apiGet("get_pending_match");
    if(pending?.pending && pending.summary && pending.players?.length){
      renderOngoingMatch(el, pending.summary, pending.players);
      startLatestMatchPolling();
      return;
    }
    stopLatestMatchPolling();
    const data = await apiGet("get_latest_result");
    renderLatestResult(data);
  }catch(e){
    console.error(e);
    stopLatestMatchPolling();
    if(el) el.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được trận đấu.")}</div>`;
  }
}
