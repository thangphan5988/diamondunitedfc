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
      rating_after: p.rating_after
    });
  });
  return map;
}

function latestResultDeltaHtml(delta){
  if(!Number.isFinite(delta) || delta === 0) return "";
  return `<div class="lrDelta ${deltaClass(delta)}">${deltaLabel(delta)} rating</div>`;
}

function latestResultCapStatsHtml(stat){
  const goals = Number(stat.goals) || 0;
  const assists = Number(stat.assists) || 0;
  if(!goals && !assists) return "";
  const g = goals ? `<span class="goals">⚽${goals}</span>` : "";
  const a = assists ? `<span class="assists">🅰️${assists}</span>` : "";
  return `<div class="lrStatRow">${g}${a}</div>`;
}

function latestResultPitchCardHtml(p, teamClass, stat, isCap){
  const mvp = stat.is_mvp ? `<div class="lrMvpBadge">⭐</div>` : "";
  const score = stat.match_score ?? "—";
  const avatar = p.avatar || defaultAvatar(p.name);
  return `<div class="lrCard ${teamClass}">
    ${mvp}
    <img src="${escapeAttr(avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">
    <div class="lrName">${escapeHtml(p.name)}</div>
    <div class="lrScore">${escapeHtml(String(score))} điểm</div>
    ${isCap ? latestResultCapStatsHtml(stat) : ""}
    ${latestResultDeltaHtml(stat.rating_delta)}
  </div>`;
}

function latestResultBenchCardHtml(p, teamClass, stat, isCap){
  const mvp = stat.is_mvp ? `<div class="lrMvpBadge">⭐</div>` : "";
  const score = stat.match_score ?? "—";
  const avatar = p.avatar || defaultAvatar(p.name);
  const capStats = isCap ? latestResultCapStatsHtml(stat) : "";
  const delta = latestResultDeltaHtml(stat.rating_delta);
  return `<div class="lrBenchCard ${teamClass}">
    ${mvp}
    <img src="${escapeAttr(avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">
    <div class="lrBenchMeta">
      <div class="lrName">${escapeHtml(p.name)}</div>
      <div class="lrScore">${escapeHtml(String(score))} điểm · dự bị</div>
      ${capStats}
      ${delta}
    </div>
  </div>`;
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
    `<div class="benchItem"><span class="benchRating">${p.rating || 5}</span><img src="${escapeAttr(p.avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">${escapeHtml(p.name)} · ${p.main}</div>`
  ).join("");
}

function getOngoingMatchPhase(summary){
  const status = String(summary?.status || "").toLowerCase();
  if(status === "completed") return "completed";
  const exported = status === "lineup_exported" || !!summary?.image_filename;
  if(exported) return "awaiting_result";
  if(summary?.team_a_lineup_confirmed && summary?.team_b_lineup_confirmed) return "awaiting_export";
  if(status === "lineup_published" || status === "lineup_exported") return "hlv_arranging";
  return "preparing";
}

function ongoingMatchPhaseHtml(summary){
  const phase = getOngoingMatchPhase(summary);
  const confA = !!summary?.team_a_lineup_confirmed;
  const confB = !!summary?.team_b_lineup_confirmed;
  let barClass = "lmPhaseBar";
  let title = "🔴 Trận đang diễn ra";
  let detail = "Điều phối đang chuẩn bị đội hình";

  if(phase === "hlv_arranging"){
    barClass += " wait";
    detail = `HLV đang sắp xếp · 🔴 ${confA ? "Đã chốt" : "Đang sắp xếp"} · 🟡 ${confB ? "Đã chốt" : "Đang sắp xếp"}`;
  }else if(phase === "awaiting_export"){
    barClass += " wait";
    detail = "Cả 2 HLV đã chốt — chờ xuất hình đội hình";
  }else if(phase === "awaiting_result"){
    barClass += " done";
    title = "✓ Đội hình đã chốt";
    detail = "Đã xuất hình — chờ cập nhật kết quả sau trận";
  }else if(phase === "preparing"){
    detail = "Điều phối đang random / chuẩn bị gửi HLV";
  }

  return `<div class="${barClass}">
    <span>${title}</span>
    <span class="lmPhaseDetail">${detail}</span>
  </div>`;
}

function ongoingTeamConfirmBadge(confirmed){
  return confirmed
    ? `<span class="lmConfirmBadge done">✓ Đã chốt</span>`
    : `<span class="lmConfirmBadge pending">⏳ Đang sắp xếp</span>`;
}

function publicMatchTeamPanelHtml(opts){
  const {
    idPrefix, teamLabel, teamColor, formation, pitchSuffix, benchSuffix, showStatus, teamConfirmed
  } = opts;
  const pitchId = idPrefix + pitchSuffix;
  const benchId = idPrefix + benchSuffix;
  const badge = showStatus ? ongoingTeamConfirmBadge(!!teamConfirmed) : "";
  const formRow = formation ? `<div class="formationControl">
      <label>Sơ đồ</label>
      <div class="formationReadonly">${escapeHtml(formation)}</div>
    </div>` : "";

  return `<div class="lmTeamPanel">
    <div class="teamHead">
      <h2 style="color:${teamColor}">${teamLabel}</h2>
      ${badge}
    </div>
    ${formRow}
    <div class="lineupBody">
      <div class="pitchCol">
        <div class="pitch lrPitch" id="${pitchId}">${LR_PITCH_MARKINGS}</div>
      </div>
      <div class="bench benchSide">
        <h3>Dự bị</h3>
        <div id="${benchId}" class="benchList"></div>
      </div>
    </div>
  </div>`;
}

function latestResultScoreBoardHtml(summary, isCap){
  const a = formatHistoryScore(summary?.team_a_score);
  const b = formatHistoryScore(summary?.team_b_score);
  if(isCap){
    return `<div class="lrScoreBoard">
      <div class="lrTeamScore blue">
        <span class="lrTeamLabel">DUFC</span>
        <span class="lrScoreNum">${escapeHtml(String(a))}</span>
      </div>
      <div class="lrVs">VS</div>
      <div class="lrTeamScore opp">
        <span class="lrTeamLabel">${escapeHtml(String(summary.opponent_name || "Đối thủ"))}</span>
        <span class="lrScoreNum">${escapeHtml(String(b))}</span>
      </div>
    </div>`;
  }
  return `<div class="lrScoreBoard">
    <div class="lrTeamScore red">
      <span class="lrTeamLabel">🔴 Đội A</span>
      <span class="lrScoreNum">${escapeHtml(String(a))}</span>
    </div>
    <div class="lrVs">VS</div>
    <div class="lrTeamScore yellow">
      <span class="lrTeamLabel">🟡 Đội B</span>
      <span class="lrScoreNum">${escapeHtml(String(b))}</span>
    </div>
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

  const mvps = historyPlayers.filter(p => p.is_mvp === true || p.is_mvp === "TRUE");
  const mvpNames = summary.mvp_players
    ? String(summary.mvp_players)
    : mvps.map(p => p.player_name).join(", ");

  const mvpBar = mvpNames
    ? `<div class="lrMvpBar">🏆 MVP: <b>${escapeHtml(mvpNames)}</b></div>`
    : "";

  const completedBar = embed ? "" : `<div class="lmPhaseBar done">
    <span>✓ Trận đã kết thúc</span>
    <span class="lmPhaseDetail">Kết quả & điểm cầu thủ đã được cập nhật</span>
  </div>`;

  const capResultMeta = `⚽ Trận Cáp · ${escapeHtml(fMain)}`;
  const headerHtml = embed
    ? `<div class="meta">${isCap
        ? capResultMeta
        : `Nội bộ · ${escapeHtml(fMain)} vs ${escapeHtml(fSub)}`}</div>`
    : `<div class="lrHeader">
        <h3>${escapeHtml(displayMatchLabel(summary))}</h3>
        <div class="meta">${isCap
          ? capResultMeta
          : `Nội bộ · ${escapeHtml(fMain)} vs ${escapeHtml(fSub)}`}</div>
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
      ${headerHtml}
      ${completedBar}
      ${mvpBar}
      ${latestResultScoreBoardHtml(summary, true)}
      <div class="teams lmTeams lmTeamsCapDone">
        ${publicMatchTeamPanelHtml({
          idPrefix, teamLabel: "⚽ Đội hình ra sân", teamColor: "#38bdf8", formation: fMain,
          pitchSuffix: "PitchMain", benchSuffix: "BenchMain"
        })}
      </div>
    `;
    clearPitch(pMain);
    renderLatestResultLineup(pMain, lineupMain, fMain, "capTeam", statMap, true);
    renderLatestResultBench(bMain, lineupMain.bench || [], "capTeam", statMap, true);
    return;
  }

  containerEl.innerHTML = `
    ${headerHtml}
    ${completedBar}
    ${mvpBar}
    ${latestResultScoreBoardHtml(summary, false)}
    <div class="teams lmTeams">
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🔴 Đội A", teamColor: "#ef4444", formation: fMain,
        pitchSuffix: "PitchA", benchSuffix: "BenchA"
      })}
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🟡 Đội B", teamColor: "#facc15", formation: fSub,
        pitchSuffix: "PitchB", benchSuffix: "BenchB"
      })}
    </div>
  `;
  clearPitch(pA);
  clearPitch(pB);
  renderLatestResultLineup(pA, result.lineupA, fMain, "redTeam", statMap, false);
  renderLatestResultLineup(pB, result.lineupB, fSub, "yellowTeam", statMap, false);
  renderLatestResultBench(bA, result.lineupA.bench || [], "redTeam", statMap, false);
  renderLatestResultBench(bB, result.lineupB.bench || [], "yellowTeam", statMap, false);
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
    containerEl.innerHTML = `
      ${headerHtml}
      ${ongoingMatchPhaseHtml(summary)}
      <div class="teams lmTeams">
        ${publicMatchTeamPanelHtml({
          idPrefix, teamLabel: "⚽ Đội hình ra sân", teamColor: "#38bdf8", formation: fMain,
          pitchSuffix: "PitchMain", benchSuffix: "BenchMain"
        })}
        ${publicMatchTeamPanelHtml({
          idPrefix, teamLabel: "🔄 Đội hình Phụ", teamColor: "#a78bfa", formation: fSub,
          pitchSuffix: "PitchSub", benchSuffix: "BenchSub"
        })}
      </div>
    `;
    clearPitch(pMain);
    clearPitch(pSub);
    renderPreviewPitchLineup(pMain, result.lineupMain || result.lineupA, fMain, "capTeam");
    renderPreviewPitchLineup(pSub, result.lineupSub || result.lineupB, fSub, "capSubTeam");
    renderPreviewBench(bMain, (result.lineupMain || result.lineupA).bench || []);
    renderPreviewBench(bSub, (result.lineupSub || result.lineupB).bench || []);
    return;
  }

  containerEl.innerHTML = `
    ${headerHtml}
    ${ongoingMatchPhaseHtml(summary)}
    <div class="teams lmTeams">
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🔴 Đội A", teamColor: "#ef4444", formation: fMain,
        pitchSuffix: "PitchA", benchSuffix: "BenchA", showStatus: true, teamConfirmed: confA
      })}
      ${publicMatchTeamPanelHtml({
        idPrefix, teamLabel: "🟡 Đội B", teamColor: "#facc15", formation: fSub,
        pitchSuffix: "PitchB", benchSuffix: "BenchB", showStatus: true, teamConfirmed: confB
      })}
    </div>
  `;
  clearPitch(pA);
  clearPitch(pB);
  renderPreviewPitchLineup(pA, result.lineupA, fMain, "redTeam");
  renderPreviewPitchLineup(pB, result.lineupB, fSub, "yellowTeam");
  renderPreviewBench(bA, result.lineupA.bench || []);
  renderPreviewBench(bB, result.lineupB.bench || []);
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
