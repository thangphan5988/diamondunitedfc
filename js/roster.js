/* Roster load, OCR, player picker */

async function loadDefaultRoster(){
  clearError();
  try{
    const data = await apiGet("get_roster");
    if(!data.players?.length) throw new Error("Chưa có dữ liệu cầu thủ trên server.");
    applyRosterFromApi(data.players);
  }catch(e){
    showError(e.message || "Không load được danh sách cầu thủ từ API.");
  }
}

function applyRosterFromApi(rows){
  if(!rows.length) throw new Error("Chưa có dữ liệu cầu thủ trên server.");

  const list = rows.map((row, idx) => {
    const name = String(row.name || "").trim();
    const positionRaw = String(row.position || row.main_position || "").trim();
    const positionList = splitPositions(positionRaw);
    const main = positionList[0] || "";
    let secondary = positionList.slice(1);
    const secondaryRaw = String(row.secondary_positions || "").trim();
    if(secondaryRaw){
      const more = splitPositions(secondaryRaw);
      secondary = [...new Set([...secondary, ...more].filter(x => x !== main))];
    }
    const rating = isAnonymousPlayer(row) || row.is_anonymous === true || row.is_anonymous === 1
      ? anonymousLineupRating()
      : Number(row.rating || 5);
    const mvpCount = Number(row.mvp_count || 0);
    const avatarText = String(row.avatar || "").trim();
    const side = normalizeSideList(row.preferred_side || "");

    if(!name || !POS.includes(main)) return null;

    const anonymous = row.is_anonymous === true || row.is_anonymous === 1 || row.is_anonymous === "1";

    return {
      id: row.id || (idx + 1) + "_" + name,
      name,
      display_name: String(row.display_name || "").trim(),
      main,
      secondary,
      rating: Number.isFinite(rating) ? rating : anonymousLineupRating(),
      mvp_count: anonymous ? 0 : (Number.isFinite(mvpCount) && mvpCount >= 0 ? Math.round(mvpCount) : 0),
      jersey_number: row.jersey_number != null && row.jersey_number !== "" ? Number(row.jersey_number) : null,
      description: String(row.description || "").trim(),
      birth_date: String(row.birth_date || "").trim(),
      joined_at: String(row.joined_at || "").trim(),
      last_match_at: String(row.last_match_at || "").trim(),
      profile_card: row.profile_card || "",
      avatar: avatarSrc(avatarText, name),
      side,
      inactivity_penalty: anonymous ? 0 : (Number(row.inactivity_penalty) || 0),
      days_inactive: anonymous ? 0 : (Number(row.days_inactive) || 0),
      anonymous,
      selected: true
    };
  }).filter(Boolean);

  if(!list.length) throw new Error("Không đọc được cầu thủ từ API.");
  players = list;
  renderPlayerPicker();
  updateStats();
  if(document.getElementById("statsView")?.style.display !== "none") renderStats();
  if(document.getElementById("teamsView")?.style.display !== "none") renderTeams();
  maybeAutoOptimizeCapAfterImport();
}

function renderPlayerPicker(){
  const el = document.getElementById("players");
  const pickerLocked = matchLocked ||
    (canSplitTeams() && lineupPublishedToHlv && lineupMode === "internal") ||
    (canCoordinateCap() && lineupPublishedToHlv && lineupMode === "cap");
  const keyword = normalizeName(String(document.getElementById("searchBox")?.value || "").trim());

  const filtered = players
    .map((p, i) => ({p, i}))
    .filter(({p}) => {
      if(!keyword) return true;
      const haystack = normalizeName(`${p.name} ${p.display_name || ""} ${p.main} ${p.secondary.join(" ")} ${sideLabel(p.side)} ${jerseyLabel(p.jersey_number)}`);
      return haystack.includes(keyword);
    })
    .sort((a, b) => {
      if(a.p.selected !== b.p.selected) return a.p.selected ? -1 : 1;
      return a.p.name.localeCompare(b.p.name, "vi");
    });

  if(!filtered.length){
    el.innerHTML = `<div class="row" style="grid-template-columns:1fr;color:#94a3b8">Không tìm thấy cầu thủ phù hợp.</div>`;
    return;
  }

  el.innerHTML = filtered.map(({p,i})=>`
    <label class="row">
      <input type="checkbox" ${p.selected?"checked":""} ${pickerLocked?"disabled":""} onchange="players[${i}].selected=this.checked;updateStats()">
      <img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'">
      <div><div class="name">${escapeHtml(playerDisplayName(p))}${isAnonymousPlayer(p) ? ` <span class="metaAnonTag">Ẩn danh</span>` : ""}</div><div class="meta">${p.display_name && p.display_name !== p.name ? `<span class="metaCanon">@${escapeHtml(p.name)} · </span>` : ""}${jerseyLabel(p.jersey_number) ? `<span class="metaJersey">${escapeHtml(jerseyLabel(p.jersey_number))} · </span>` : ""}${p.main}${p.secondary.length?"/"+p.secondary.join("/"):""}${p.side ? " · " + sideLabel(p.side) : ""} · rating ${p.rating}${Number(p.inactivity_penalty) > 0 ? ` (−${p.inactivity_penalty} vắng)` : ""}${p.mvp_count ? ` · 🏆 ${p.mvp_count} MVP` : ""}${isAnonymousPlayer(p) ? " · đá ké" : ""}</div></div>
      <span class="badge">${p.main}</span>
    </label>`).join("");
}

function cleanDetectedText(text){
  return String(text || "")
    .replace(/DC\s*[-–—]\s*/gi, " ")
    .replace(/\bBan\b/gi, " Thang Phan ")
    .replace(/\bBạn\b/gi, " Thang Phan ")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForOcr(text){
  return removeVietnameseAccent(text)
    .toLowerCase()
    .replace(/dc\s*[-–—]?\s*/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getOcrLines(rawText){
  return String(rawText || "")
    .split(/\r?\n/)
    .map(line => normalizeForOcr(line))
    .map(line => line.replace(/^dc\s+/, "").trim())
    .filter(line => line.length >= 2);
}

function isLikelyExactNameInLine(line, playerName){
  const name = normalizeForOcr(playerName);
  if(!name) return false;

  // Exact phrase with word boundary.
  const phraseRegex = new RegExp(`(^|\\s)${escapeRegExp(name)}($|\\s)`, "i");
  if(phraseRegex.test(line)) return true;

  // Zalo sometimes truncates long names with "..."; support prefix match for long names only.
  const tokens = name.split(/\s+/).filter(Boolean);
  if(tokens.length >= 3){
    const prefix2 = tokens.slice(0, 2).join(" ");
    const prefix3 = tokens.slice(0, 3).join(" ");
    if(line.includes(prefix3) || line.includes(prefix2)) return true;
  }

  return false;
}

function fuzzyNameMatch(line, playerName){
  const name = normalizeForOcr(playerName);
  const lineTokens = new Set(line.split(/\s+/).filter(t => t.length >= 2));
  const nameTokens = name.split(/\s+/).filter(t => t.length >= 2);

  if(nameTokens.length === 1){
    return lineTokens.has(nameTokens[0]);
  }

  const matched = nameTokens.filter(t => lineTokens.has(t)).length;

  // Rất chặt để tránh detect nhầm:
  // - tên 2 token: phải match đủ 2
  // - tên >=3 token: cho phép thiếu 1 token
  if(nameTokens.length === 2) return matched === 2;
  return matched >= nameTokens.length - 1;
}

function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectNamesFromOcrText(rawText){
  const lines = getOcrLines(rawText);
  const detected = new Set();

  for(const p of players){
    const name = normalizeForOcr(p.name);
    if(!name) continue;

    let found = false;

    // Pass 1: exact line/phrase match.
    for(const line of lines){
      if(isLikelyExactNameInLine(line, p.name)){
        found = true;
        break;
      }
    }

    // Pass 2: strict token fallback.
    if(!found){
      for(const line of lines){
        if(fuzzyNameMatch(line, p.name)){
          found = true;
          break;
        }
      }
    }

    if(found) detected.add(p.name);
  }

  return detected;
}

function nameMatchScore(ocrText, playerName){
  // Kept for backward compatibility; new code uses detectNamesFromOcrText().
  const detected = detectNamesFromOcrText(ocrText);
  return detected.has(playerName);
}

async function detectPlayersFromScreenshot(evt){
  clearError();
  if(isLoggedIn() && !canImportRoster()){
    showError("Bạn không có quyền import danh sách cầu thủ.");
    evt.target.value = "";
    return;
  }
  const status = document.getElementById("ocrStatus");
  const files = Array.from(evt.target.files || []);
  if(!files.length) return;

  if(!players.length){
    showError("Danh sách thành viên chưa load xong. Chờ vài giây rồi thử lại.");
    return;
  }

  try{
    const detectedSet = new Set();
    status.textContent = `Đang đọc ${files.length} screenshot...`;

    for(let fileIndex = 0; fileIndex < files.length; fileIndex++){
      const file = files[fileIndex];

      const result = await Tesseract.recognize(file, "vie+eng", {
        logger: m => {
          if(m.status === "recognizing text"){
            status.textContent =
              `Đang detect screenshot ${fileIndex + 1}/${files.length}... ${Math.round((m.progress || 0) * 100)}%`;
          }
        }
      });

      const rawText = result?.data?.text || "";
      const detectedInThisImage = detectNamesFromOcrText(rawText);
      detectedInThisImage.forEach(name => detectedSet.add(name));
    }

    pendingDetectedNames = detectedSet;
    status.textContent = detectedSet.size
      ? `Detect tạm ${detectedSet.size} cầu thủ từ ${files.length} screenshot. Vui lòng xác nhận trong popup.`
      : `Chưa detect chắc chắn tên nào từ ${files.length} screenshot. Anh có thể chọn thủ công trong popup.`;

    openConfirmModal();

    // Reset input để lần sau có thể upload lại cùng bộ ảnh.
    evt.target.value = "";
  }catch(e){
    status.textContent = "";
    showError("Không detect được screenshot. Kiểm tra mạng vì OCR cần tải thư viện/language từ CDN.");
  }
}
function openConfirmModal(){
  document.getElementById("confirmSearch").value = "";
  renderConfirmList();
  document.getElementById("confirmModal").classList.add("show");
  syncModalOpenState();
}

function closeConfirmModal(){
  document.getElementById("confirmModal").classList.remove("show");
  syncModalOpenState();
}

function renderConfirmList(){
  const keyword = normalizeName(String(document.getElementById("confirmSearch")?.value || "").trim());
  const list = players
    .filter(p => {
      if(!keyword) return true;
      return normalizeName(`${p.name} ${p.main} ${p.secondary.join(" ")} ${sideLabel(p.side)}`).includes(keyword);
    })
    .sort((a, b) => {
      const aSelected = pendingDetectedNames.has(a.name) ? 1 : 0;
      const bSelected = pendingDetectedNames.has(b.name) ? 1 : 0;
      if(aSelected !== bSelected) return bSelected - aSelected;
      return a.name.localeCompare(b.name, "vi");
    });

  document.getElementById("confirmSummary").textContent =
    `Đang chọn ${pendingDetectedNames.size} / ${players.length} thành viên`;

  document.getElementById("confirmList").innerHTML = list.map((p, i) => {
    const checked = pendingDetectedNames.has(p.name) ? "checked" : "";
    return `<label class="confirmPlayer">
      <input type="checkbox" ${checked} onchange="togglePendingPlayer('${escapeAttr(p.name)}', this.checked)">
      <img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'">
      <div><div class="name">${escapeHtml(playerDisplayName(p))}</div><div class="meta">${p.main}${p.secondary.length?"/"+p.secondary.join("/"):""}${p.side ? " · " + sideLabel(p.side) : ""}</div></div>
    </label>`;
  }).join("");
}

function togglePendingPlayer(name, checked){
  if(checked) pendingDetectedNames.add(name);
  else pendingDetectedNames.delete(name);
  document.getElementById("confirmSummary").textContent =
    `Đang chọn ${pendingDetectedNames.size} / ${players.length} thành viên`;
}

function setConfirmAll(value){
  const keyword = normalizeName(String(document.getElementById("confirmSearch")?.value || "").trim());
  players.forEach(p => {
    const visible = !keyword || normalizeName(`${p.name} ${p.main} ${p.secondary.join(" ")} ${sideLabel(p.side)}`).includes(keyword);
    if(visible){
      if(value) pendingDetectedNames.add(p.name);
      else pendingDetectedNames.delete(p.name);
    }
  });
  renderConfirmList();
}

function applyConfirmedPlayers(){
  players.forEach(p => {
    p.selected = pendingDetectedNames.has(p.name);
  });
  players.sort((a, b) => {
    if(a.selected !== b.selected) return a.selected ? -1 : 1;
    return a.name.localeCompare(b.name, "vi");
  });
  renderPlayerPicker();
  updateStats();
  document.getElementById("ocrStatus").innerHTML =
    `Đã áp dụng <b>${players.filter(p=>p.selected).length}</b> cầu thủ tham gia hôm nay.`;
  closeConfirmModal();
  maybeAutoOptimizeCapAfterImport();
}

function clearTodaySelection(){
  players.forEach(p => p.selected = false);
  renderPlayerPicker();
  updateStats();
}

function selectAll(v){players.forEach(p=>p.selected=v);renderPlayerPicker();updateStats();}
