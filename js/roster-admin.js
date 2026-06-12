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
  const s = String(value).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if(iso) return iso[1];
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

function rosterLabeledTextarea(key, field, label, hint, value){
  const id = rosterFieldId(key, field);
  const hintHtml = hint ? `<span class="rosterFieldHint">${escapeHtml(hint)}</span>` : "";
  return `<label class="rosterFieldGroup" for="${id}">
    <span class="rosterFieldLabel">${escapeHtml(label)}${hintHtml}</span>
    <textarea id="${id}" rows="3" placeholder="Câu tự giới thiệu ngầu & vui...">${escapeHtml(value || "")}</textarea>
  </label>`;
}

function rosterDescriptionFieldHtml(key, data){
  const desc = String(data?.description || "").trim();
  return `<div class="rosterDescriptionField">
    ${rosterLabeledTextarea(key, "description", "Mô tả (bio)", "Để trống → gán câu nói huyền thoại phù hợp", desc)}
    <button type="button" class="secondary rosterSuggestDescBtn" onclick="suggestRosterDescription('${escapeAttr(key)}')">✨ Gợi ý câu nói</button>
  </div>`;
}

function suggestRosterDescription(key){
  const form = readRosterForm(key);
  const ta = document.getElementById(rosterFieldId(key, "description"));
  if(!ta) return;
  if(!form.name) return alert("Nhập tên cầu thủ trước.");
  ta.value = generatePlayerDescription({
    name: form.name,
    display_name: form.display_name,
    main: form.position,
    position: form.position,
    secondary_positions: form.secondary_positions,
    profile_card: form.profile_card,
    avatar: form.avatar,
    jersey_number: form.jersey_number,
    rating: form.base_rating,
    mvp_count: form.mvp_count
  });
}

function rosterAvatarPreviewInner(avatarUrl, name){
  if(!avatarUrl) return `<span class="meta rosterAvatarEmpty">Chưa có avatar</span>`;
  return `<img class="rosterAvatarPreviewImg" src="${escapeAttr(avatarSrc(avatarUrl, name))}" alt="" onerror="this.src='${defaultAvatar(name || 'DUFC')}'">`;
}

function rosterAvatarFieldsHtml(key, data){
  const avatar = String(data?.avatar || "").trim();
  const profileCard = String(data?.profile_card || "").trim();
  const playerName = String(data?.name || "").trim();
  return `<div class="rosterAvatarField">
    <span class="rosterFieldLabel">Avatar Zalo <span class="rosterFieldHint">Dùng trên sân / card cầu thủ</span></span>
    <div class="rosterAvatarRow">
      <div class="rosterAvatarPreview" id="rosterAvatarPreview_${escapeAttr(key)}">
        ${rosterAvatarPreviewInner(avatar, playerName)}
      </div>
      <div class="rosterAvatarActions">
        <label class="fileUploadBtn rosterAvatarUploadBtn">
          <span class="fileUploadIcon">📷</span> Upload avatar Zalo
          <input type="file" accept="image/png,image/jpeg,image/webp" onchange="handleRosterZaloAvatarFile('${escapeAttr(key)}', this)">
        </label>
      </div>
    </div>
    ${rosterLabeledInput(key, "avatar", "Link avatar Zalo", "Tự điền sau upload · hoặc avatars/ten.png", `type="text" placeholder="avatars/ten-file.png" value="${escapeAttr(avatar)}" oninput="updateRosterAvatarPreview('${escapeAttr(key)}')"`)} 
  </div>
  <div class="rosterAvatarField rosterProfileCardField">
    <span class="rosterFieldLabel">Player card full <span class="rosterFieldHint">Ảnh poster · dùng cho danh sách full sau</span></span>
    <div class="rosterAvatarRow">
      <div class="rosterAvatarPreview rosterProfileCardPreview" id="rosterProfileCardPreview_${escapeAttr(key)}">
        ${profileCard ? rosterAvatarPreviewInner(profileCard, playerName) : `<span class="meta rosterAvatarEmpty">Chưa có card full</span>`}
      </div>
      <div class="rosterAvatarActions">
        <label class="fileUploadBtn rosterAvatarUploadBtn">
          <span class="fileUploadIcon">🃏</span> Upload card full
          <input type="file" accept="image/png,image/jpeg,image/webp" onchange="handleRosterProfileCardFile('${escapeAttr(key)}', this)">
        </label>
      </div>
    </div>
    ${rosterLabeledInput(key, "profile_card", "Link card full", "Tự điền sau upload · avatars/full/ten.png", `type="text" placeholder="avatars/full/ten-file.png" value="${escapeAttr(profileCard)}" oninput="updateRosterProfileCardPreview('${escapeAttr(key)}')"`)} 
  </div>`;
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
      ${rosterLabeledInput(key, "jersey_number", "Số áo", "0–99 · để trống nếu chưa gán", `type="number" min="0" max="99" step="1" placeholder="—" value="${escapeAttr(data.jersey_number != null && data.jersey_number !== "" ? String(data.jersey_number) : "")}"`)}
      ${rosterLabeledInput(key, "mvp", "Số MVP", "", `type="number" min="0" step="1" placeholder="0" value="${escapeAttr(String(Number(data.mvp_count) || 0))}"`)}
    </div>
    ${rosterAvatarFieldsHtml(key, data)}
    ${rosterDescriptionFieldHtml(key, data)}
    <div class="rosterAdminFormRow">
      ${rosterLabeledInput(key, "birth_date", "Ngày sinh", "Chọn ngày/tháng/năm · để trống nếu chưa biết", `type="date" value="${escapeAttr(toDateInputValue(data.birth_date))}"`)}
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
    jersey_number: val("jersey_number").trim(),
    mvp_count: Number(val("mvp")),
    avatar: val("avatar").trim(),
    profile_card: val("profile_card").trim(),
    description: val("description").trim(),
    birth_date: val("birth_date").trim(),
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
    const jersey = p.jersey_number != null && p.jersey_number !== "" ? ` · #${Number(p.jersey_number)}` : "";
    const birth = birthDateLabel(p.birth_date);
    const birthMeta = birth ? ` · 🎂 ${birth}` : "";

    parts.push(`<div class="rosterAdminCard${expanded ? " expanded" : ""}">
      <div class="rosterAdminCardHead" onclick="toggleRosterPlayer(${Number(p.id)})">
        <div class="rosterAdminRowMain">
          <img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'" alt="">
          <div>
            <b>${escapeHtml(label)}</b>${canonical}
            <div class="meta">${escapeHtml(posText)}${side}${jersey}${birthMeta} · ⭐ ${Number(p.rating) || 5}${inactive} · 🏆 ${Number(p.mvp_count) || 0}</div>
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

  if(!form.description.trim()){
    form.description = generatePlayerDescription({
      name: form.name,
      display_name: form.display_name,
      main: form.position,
      position: form.position,
      secondary_positions: form.secondary_positions,
      profile_card: form.profile_card,
      avatar: form.avatar,
      jersey_number: form.jersey_number,
      rating: form.base_rating,
      mvp_count: form.mvp_count
    });
  }

  const payload = {
    name: form.name,
    display_name: form.display_name,
    position: form.position,
    secondary_positions: form.secondary_positions,
    preferred_side: form.preferred_side,
    base_rating: Number.isFinite(form.base_rating) ? form.base_rating : 5,
    jersey_number: form.jersey_number,
    mvp_count: Number.isFinite(form.mvp_count) ? form.mvp_count : 0,
    avatar: form.avatar,
    profile_card: form.profile_card,
    description: form.description,
    birth_date: form.birth_date,
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

function avatarFilenameBase(name){
  return String(name || "player")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "player";
}

function readFileAsBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
    reader.readAsDataURL(file);
  });
}

function updateRosterAvatarPreview(key){
  const preview = document.getElementById(`rosterAvatarPreview_${key}`);
  if(!preview) return;
  const avatar = document.getElementById(rosterFieldId(key, "avatar"))?.value?.trim() || "";
  const name = document.getElementById(rosterFieldId(key, "name"))?.value?.trim() || "";
  preview.innerHTML = rosterAvatarPreviewInner(avatar, name);
}

function updateRosterProfileCardPreview(key){
  const preview = document.getElementById(`rosterProfileCardPreview_${key}`);
  if(!preview) return;
  const profileCard = document.getElementById(rosterFieldId(key, "profile_card"))?.value?.trim() || "";
  const name = document.getElementById(rosterFieldId(key, "name"))?.value?.trim() || "";
  preview.innerHTML = profileCard
    ? rosterAvatarPreviewInner(profileCard, name)
    : `<span class="meta rosterAvatarEmpty">Chưa có card full</span>`;
}

async function uploadRosterImageFile(key, input, uploadKind){
  const file = input?.files?.[0];
  if(!file) return;
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type || "")){
    alert("Chọn file PNG, JPG hoặc WebP.");
    input.value = "";
    return;
  }
  if(file.size > 2 * 1024 * 1024){
    alert("Ảnh tối đa 2MB.");
    input.value = "";
    return;
  }

  const nameBase = document.getElementById(rosterFieldId(key, "name"))?.value?.trim() || "";
  if(!nameBase){
    alert("Nhập tên cầu thủ (name) trước khi upload ảnh.");
    input.value = "";
    return;
  }

  const isZalo = uploadKind === "zalo";
  const previewId = isZalo ? `rosterAvatarPreview_${key}` : `rosterProfileCardPreview_${key}`;
  const preview = document.getElementById(previewId);
  if(preview) preview.innerHTML = `<span class="meta">Đang upload...</span>`;

  try{
    const imageBase64 = await readFileAsBase64(file);
    const data = await apiPost("admin_upload_avatar", {
      filename_base: avatarFilenameBase(nameBase),
      content_type: file.type,
      image_base64: imageBase64,
      upload_kind: uploadKind
    });
    if(isZalo){
      const avatarInput = document.getElementById(rosterFieldId(key, "avatar"));
      if(avatarInput) avatarInput.value = data.avatar || "";
      updateRosterAvatarPreview(key);
      showToast("Đã upload avatar Zalo.", "success");
    }else{
      const profileInput = document.getElementById(rosterFieldId(key, "profile_card"));
      if(profileInput) profileInput.value = data.profile_card || "";
      updateRosterProfileCardPreview(key);
      showToast("Đã upload player card full.", "success");
    }
  }catch(e){
    if(isZalo) updateRosterAvatarPreview(key);
    else updateRosterProfileCardPreview(key);
    alert(e.message || "Upload thất bại.");
  }finally{
    input.value = "";
  }
}

function handleRosterZaloAvatarFile(key, input){
  return uploadRosterImageFile(key, input, "zalo");
}

async function handleRosterProfileCardFile(key, input){
  return uploadRosterImageFile(key, input, "full");
}
