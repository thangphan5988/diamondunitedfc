/* Admin player roster CRUD — inline expand per player */

let expandedRosterKey = null;
let cachedAdminPlayers = [];

function rosterFormKey(id){
  return id == null ? "new" : String(id);
}

function switchAdminSection(section){
  const usersPanel = document.getElementById("adminUsersPanel");
  const rosterPanel = document.getElementById("adminRosterPanel");
  const tabUsers = document.getElementById("adminTabUsers");
  const tabRoster = document.getElementById("adminTabRoster");
  if(!usersPanel || !rosterPanel) return;

  const showUsers = section === "users" && canManageUsers();
  const showRoster = section === "roster" && canManageRoster();
  if(!showUsers && showRoster) section = "roster";
  if(showUsers && !showRoster) section = "users";

  usersPanel.style.display = section === "users" ? "" : "none";
  rosterPanel.style.display = section === "roster" ? "" : "none";
  if(tabUsers) tabUsers.classList.toggle("active", section === "users");
  if(tabRoster) tabRoster.classList.toggle("active", section === "roster");

  if(section === "users") loadAdminUsers();
  if(section === "roster") loadAdminPlayers();
}

function rosterPositionsLabel(p){
  const chain = formatPositionChain(p.position || p.main, p.secondary_positions);
  return chain || "—";
}

function rosterSideLabel(p){
  return formatSideChain(p.preferred_side || p.side || "");
}

function toDateInputValue(value){
  if(!value) return "";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromDateInputValue(value){
  const s = String(value || "").trim();
  if(!s) return "";
  return `${s}T12:00:00.000Z`;
}

function rosterFieldId(key, field){
  return `rosterFld_${key}_${field}`;
}

function rosterLabeledInput(key, field, label, hint, attrs){
  const id = rosterFieldId(key, field);
  const hintHtml = hint ? `<span class="rosterFieldHint">${escapeHtml(hint)}</span>` : "";
  return `<label class="rosterFieldGroup" for="${id}">
    <span class="rosterFieldLabel">${escapeHtml(label)}${hintHtml}</span>
    <input id="${id}" ${attrs}>
  </label>`;
}

function rosterFormFieldsHtml(key, p){
  const isNew = key === "new";
  const data = p || {};
  const positionChain = formatPositionChain(data.position, data.secondary_positions) || (isNew ? "MID" : "");
  const sideChain = formatSideChain(data.preferred_side || "");

  return `<div class="rosterAdminInlineForm">
    ${rosterLabeledInput(key, "name", "Tên hệ thống (name)", "Khóa nhận diện — OCR, lịch sử trận", `type="text" placeholder="VD: Anh Phuong" value="${escapeAttr(data.name || "")}"`)}
    ${rosterLabeledInput(key, "display_name", "Tên hiển thị", "Tên đẹp trên UI — để trống thì dùng name", `type="text" placeholder="VD: Anh Phương" value="${escapeAttr(data.display_name || "")}"`)}
    ${rosterLabeledInput(key, "positions", "Vị trí sở trường", "Mục đầu = sở trường · VD: MID, DEF, FWD", `type="text" placeholder="MID, DEF, FWD" value="${escapeAttr(positionChain)}"`)}
    ${rosterLabeledInput(key, "side", "Cánh / khu vực sở trường", "Mục đầu = sở trường · VD: CENTER, RIGHT, LEFT", `type="text" placeholder="CENTER, RIGHT, LEFT" value="${escapeAttr(sideChain)}"`)}
    <div class="rosterAdminFormRow">
      ${rosterLabeledInput(key, "rating", "Rating", "", `type="number" min="0" step="1" placeholder="5" value="${escapeAttr(String(data.base_rating ?? data.rating ?? (isNew ? 5 : "")))}"`)}
      ${rosterLabeledInput(key, "mvp", "Số MVP", "", `type="number" min="0" step="1" placeholder="0" value="${escapeAttr(String(Number(data.mvp_count) || 0))}"`)}
    </div>
    ${rosterLabeledInput(key, "avatar", "Avatar URL", "Để trống = tự tạo từ tên", `type="text" placeholder="avatars/ten-file.png" value="${escapeAttr(data.avatar || "")}"`)}
    <div class="rosterAdminFormRow">
      ${rosterLabeledInput(key, "joined_at", "Ngày tham gia", "", `type="date" value="${escapeAttr(toDateInputValue(data.joined_at))}"`)}
      ${rosterLabeledInput(key, "last_match_at", "Trận gần nhất", "", `type="date" value="${escapeAttr(toDateInputValue(data.last_match_at))}"`)}
    </div>
    <div class="adminFormActions rosterInlineActions">
      <button type="button" onclick="saveRosterPlayer('${escapeAttr(key)}')">Lưu cầu thủ</button>
      <button type="button" class="secondary" onclick="collapseRosterPlayer()">Đóng</button>
      ${isNew ? "" : `<button type="button" class="danger" onclick="deleteRosterPlayer(${Number(data.id)}, event)">Xóa</button>`}
    </div>
  </div>`;
}

function readRosterForm(key){
  const val = field => document.getElementById(rosterFieldId(key, field))?.value ?? "";
  const posParsed = parsePositionChain(val("positions"));
  return {
    name: val("name").trim(),
    display_name: val("display_name").trim(),
    position: posParsed.position,
    secondary_positions: posParsed.secondary_positions,
    preferred_side: parseSideChain(val("side")),
    base_rating: Number(val("rating")),
    mvp_count: Number(val("mvp")),
    avatar: val("avatar").trim(),
    joined_at: fromDateInputValue(val("joined_at")),
    last_match_at: fromDateInputValue(val("last_match_at"))
  };
}

async function loadAdminPlayers(){
  const el = document.getElementById("adminPlayerList");
  if(!el) return;
  el.innerHTML = `<div class="meta">Đang tải...</div>`;
  try{
    const data = await apiGet("admin_list_players");
    cachedAdminPlayers = data.players || [];
    renderAdminPlayerList();
  }catch(e){
    el.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được danh sách cầu thủ.")}</div>`;
  }
}

function openNewRosterPlayer(){
  expandedRosterKey = "new";
  renderAdminPlayerList();
  document.getElementById(rosterFieldId("new", "name"))?.focus();
}

function collapseRosterPlayer(){
  expandedRosterKey = null;
  renderAdminPlayerList();
}

function toggleRosterPlayer(id){
  const key = rosterFormKey(id);
  expandedRosterKey = expandedRosterKey === key ? null : key;
  renderAdminPlayerList();
  if(expandedRosterKey === key){
    document.getElementById(rosterFieldId(key, "name"))?.focus();
  }
}

function editRosterPlayer(id){
  toggleRosterPlayer(id);
}

function renderAdminPlayerList(){
  const el = document.getElementById("adminPlayerList");
  if(!el) return;

  const q = String(document.getElementById("rosterAdminSearch")?.value || "").trim().toLowerCase();
  const list = cachedAdminPlayers.filter(p => {
    if(!q) return true;
    const hay = [
      p.name, p.display_name, p.position, p.secondary_positions, p.preferred_side,
      formatPositionChain(p.position, p.secondary_positions),
      formatSideChain(p.preferred_side)
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  const parts = [];

  if(expandedRosterKey === "new"){
    parts.push(`<div class="rosterAdminCard expanded rosterAdminCard--new">
      <div class="rosterAdminCardHead">
        <div><b>➕ Thêm cầu thủ mới</b></div>
      </div>
      ${rosterFormFieldsHtml("new", null)}
    </div>`);
  }

  if(!list.length && expandedRosterKey !== "new"){
    el.innerHTML = `<div class="meta">${q ? "Không tìm thấy cầu thủ." : "Chưa có cầu thủ."}</div>`;
    return;
  }

  list.forEach(p => {
    const key = rosterFormKey(p.id);
    const expanded = expandedRosterKey === key;
    const label = playerDisplayName(p);
    const canonical = p.name !== label ? `<span class="meta"> · ${escapeHtml(p.name)}</span>` : "";
    const posText = rosterPositionsLabel(p);
    const sideText = rosterSideLabel(p);
    const side = sideText ? ` · ${escapeHtml(sideText)}` : "";
    const inactive = Number(p.inactivity_penalty) > 0 ? ` · −${p.inactivity_penalty} vắng` : "";

    parts.push(`<div class="rosterAdminCard${expanded ? " expanded" : ""}">
      <div class="rosterAdminCardHead" onclick="toggleRosterPlayer(${Number(p.id)})">
        <div class="rosterAdminRowMain">
          <img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'" alt="">
          <div>
            <b>${escapeHtml(label)}</b>${canonical}
            <div class="meta">${escapeHtml(posText)}${side} · ⭐ ${Number(p.rating) || 5}${inactive} · 🏆 ${Number(p.mvp_count) || 0}</div>
          </div>
        </div>
        <span class="rosterExpandIcon">${expanded ? "▾" : "▸"}</span>
      </div>
      ${expanded ? rosterFormFieldsHtml(key, p) : ""}
    </div>`);
  });

  el.innerHTML = parts.join("");
}

async function saveRosterPlayer(key){
  const form = readRosterForm(key);
  if(!form.name) return alert("Nhập tên cầu thủ (name).");
  if(!form.position) return alert("Nhập vị trí sở trường (mục đầu trong chuỗi).");

  const payload = {
    name: form.name,
    display_name: form.display_name,
    position: form.position,
    secondary_positions: form.secondary_positions,
    preferred_side: form.preferred_side,
    base_rating: Number.isFinite(form.base_rating) ? form.base_rating : 5,
    mvp_count: Number.isFinite(form.mvp_count) ? form.mvp_count : 0,
    avatar: form.avatar,
    joined_at: form.joined_at,
    last_match_at: form.last_match_at
  };

  if(key !== "new"){
    payload.id = Number(key);
    if(!Number.isFinite(payload.id)) return alert("ID cầu thủ không hợp lệ.");
  }

  try{
    await apiPost("admin_save_player", payload);
    const savedKey = key;
    expandedRosterKey = null;
    await loadAdminPlayers();
    await loadDefaultRoster();
    if(savedKey !== "new"){
      expandedRosterKey = savedKey;
      renderAdminPlayerList();
    }
  }catch(e){
    alert(e.message || "Lưu thất bại.");
  }
}

async function deleteRosterPlayer(id, ev){
  if(ev) ev.stopPropagation();
  const p = cachedAdminPlayers.find(x => Number(x.id) === Number(id));
  if(!p) return;
  if(!confirm(`Xóa cầu thủ "${playerDisplayName(p)}"?\nChỉ xóa được nếu chưa tham gia trận nào.`)) return;
  try{
    await apiPost("admin_delete_player", { id });
    if(expandedRosterKey === rosterFormKey(id)) expandedRosterKey = null;
    await loadAdminPlayers();
    await loadDefaultRoster();
  }catch(e){
    alert(e.message || "Xóa thất bại.");
  }
}

function clearRosterPlayerForm(){
  openNewRosterPlayer();
}
