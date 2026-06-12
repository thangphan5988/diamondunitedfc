/* Admin sponsor CRUD */

let expandedSponsorKey = null;
let cachedAdminSponsors = [];
const SPONSOR_DEFAULT_DAYS = 14;

function sponsorDefaultEndAtIso(){
  const d = new Date();
  d.setDate(d.getDate() + SPONSOR_DEFAULT_DAYS);
  return d.toISOString();
}

function toDatetimeLocalValue(value){
  if(!value) return "";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value){
  const s = String(value || "").trim();
  if(!s) return "";
  const d = new Date(s);
  if(Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function sponsorEndAtDefaultLocal(){
  return toDatetimeLocalValue(sponsorDefaultEndAtIso());
}

function formatSponsorEndAtLabel(value){
  if(!value) return "—";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isSponsorExpired(s){
  const end = s?.end_at;
  if(!end) return false;
  return Date.parse(end) <= Date.now();
}

function isSponsorLive(s){
  if(s.active === 0 || s.active === false) return false;
  return !isSponsorExpired(s);
}

function sponsorStatCount(value){
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatSponsorStatLabel(s){
  const views = sponsorStatCount(s?.view_count);
  const clicks = sponsorStatCount(s?.click_count);
  const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : "0.0";
  return `👁 ${views.toLocaleString("vi-VN")} · 👆 ${clicks.toLocaleString("vi-VN")} · CTR ${ctr}%`;
}

function sponsorStatsHtml(s){
  if(!s?.id) return "";
  return `<div class="sponsorStatsRow">
    <span class="sponsorStatChip">👁 ${sponsorStatCount(s.view_count).toLocaleString("vi-VN")} lượt xem</span>
    <span class="sponsorStatChip">👆 ${sponsorStatCount(s.click_count).toLocaleString("vi-VN")} click</span>
  </div>`;
}

function sponsorFormKey(id){
  return id == null ? "new" : String(id);
}

function sponsorFieldId(key, field){
  return `sponsorFld_${key}_${field}`;
}

function sponsorLabeledInput(key, field, label, hint, attrs){
  const id = sponsorFieldId(key, field);
  const hintHtml = hint ? `<span class="rosterFieldHint">${escapeHtml(hint)}</span>` : "";
  return `<label class="rosterFieldGroup" for="${id}">
    <span class="rosterFieldLabel">${escapeHtml(label)}${hintHtml}</span>
    <input id="${id}" ${attrs}>
  </label>`;
}

function sponsorPreviewHtml(url, name, variant){
  const resolved = sponsorImageUrlWithBust(resolveSponsorImageUrl(url), "");
  if(!resolved){
    return `<div class="adPlaceholder" style="min-height:${variant === "mobile" ? "72px" : "140px"}"><span>${escapeHtml(name || "Chưa có ảnh")}</span></div>`;
  }
  const cls = variant === "mobile" ? "sponsorPreviewMobile" : "sponsorPreviewSide";
  const fallback = escapeAttr(name || "Chưa có ảnh");
  return `<div class="${cls}"><img src="${escapeAttr(resolved)}" alt="${escapeAttr(name || "")}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'adPlaceholder',innerHTML:'<span>${fallback}</span>'}))"></div>`;
}

function sponsorFormHtml(key, s){
  const data = s || {};
  const isNew = key === "new";
  return `<div class="rosterAdminInlineForm">
    ${sponsorLabeledInput(key, "name", "Tên nhà tài trợ", "", `type="text" placeholder="VD: Diamond Coffee" value="${escapeAttr(data.name || "")}"`)}
    ${sponsorLabeledInput(key, "link_url", "Link quảng cáo", "URL khi click banner · để trống nếu không có", `type="url" placeholder="https://..." value="${escapeAttr(data.link_url || "")}"`)}
    ${sponsorLabeledInput(key, "end_at", "Ngày kết thúc", `Mặc định +${SPONSOR_DEFAULT_DAYS} ngày khi tạo mới`, `type="datetime-local" value="${escapeAttr(toDatetimeLocalValue(data.end_at) || (isNew ? sponsorEndAtDefaultLocal() : ""))}"`)}
    <div class="rosterAdminFormRow">
      ${sponsorLabeledInput(key, "sort_order", "Thứ tự", "Số nhỏ hiện trước", `type="number" step="1" placeholder="0" value="${escapeAttr(String(data.sort_order ?? 0))}"`)}
      <label class="rosterFieldGroup permItem" style="align-self:end">
        <span class="rosterFieldLabel">Hiển thị</span>
        <input id="${sponsorFieldId(key, "active")}" type="checkbox"${data.active === 0 || data.active === false ? "" : " checked"}>
      </label>
    </div>
    ${isNew ? "" : sponsorStatsHtml(data)}
    <div class="sponsorPreviewSide" id="sponsorSidePreview_${escapeAttr(key)}">${sponsorPreviewHtml(data.image_side, data.name, "side")}</div>
    <div class="sponsorUploadRow">
      <label class="fileUploadBtn rosterAvatarUploadBtn">
        <span class="fileUploadIcon">🖼</span> Upload banner dọc (desktop)
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="handleSponsorImageFile('${escapeAttr(key)}', 'side', this)">
      </label>
    </div>
    ${sponsorLabeledInput(key, "image_side", "Link banner dọc", "Tự điền sau upload", `type="text" placeholder="sponsors/side/ten.png" value="${escapeAttr(data.image_side || "")}" oninput="updateSponsorPreview('${escapeAttr(key)}', 'side')"`)} 
    <div class="sponsorPreviewMobile" id="sponsorMobilePreview_${escapeAttr(key)}">${sponsorPreviewHtml(data.image_mobile, data.name, "mobile")}</div>
    <div class="sponsorUploadRow">
      <label class="fileUploadBtn rosterAvatarUploadBtn">
        <span class="fileUploadIcon">📱</span> Upload banner ngang (mobile)
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="handleSponsorImageFile('${escapeAttr(key)}', 'mobile', this)">
      </label>
    </div>
    ${sponsorLabeledInput(key, "image_mobile", "Link banner mobile", "Tự điền sau upload", `type="text" placeholder="sponsors/mobile/ten.png" value="${escapeAttr(data.image_mobile || "")}" oninput="updateSponsorPreview('${escapeAttr(key)}', 'mobile')"`)} 
    <div class="adminFormActions rosterInlineActions">
      <button type="button" onclick="saveSponsor('${escapeAttr(key)}')">Lưu nhà tài trợ</button>
      <button type="button" class="secondary" onclick="collapseSponsor()">Đóng</button>
      ${isNew ? "" : `<button type="button" class="danger" onclick="deleteSponsor(${Number(data.id)}, event)">Xóa</button>`}
    </div>
  </div>`;
}

function readSponsorForm(key){
  const val = field => document.getElementById(sponsorFieldId(key, field))?.value ?? "";
  const activeEl = document.getElementById(sponsorFieldId(key, "active"));
  return {
    name: val("name").trim(),
    link_url: val("link_url").trim(),
    end_at: fromDatetimeLocalValue(val("end_at")),
    image_side: val("image_side").trim(),
    image_mobile: val("image_mobile").trim(),
    sort_order: Number(val("sort_order")),
    active: activeEl ? activeEl.checked : true
  };
}

function updateSponsorPreview(key, slot){
  const form = readSponsorForm(key);
  const url = slot === "mobile" ? form.image_mobile : form.image_side;
  const el = document.getElementById(`sponsor${slot === "mobile" ? "Mobile" : "Side"}Preview_${key}`);
  if(el) el.innerHTML = sponsorPreviewHtml(url, form.name, slot);
}

async function loadAdminSponsors(){
  const el = document.getElementById("adminSponsorList");
  if(!el) return;
  el.innerHTML = `<div class="meta">Đang tải...</div>`;
  try{
    const data = await apiGet("admin_list_sponsors", { session_token: authSession?.token });
    cachedAdminSponsors = data.sponsors || [];
    renderAdminSponsorList();
    refreshSponsorAdsFromAdmin(cachedAdminSponsors.filter(isSponsorLive));
  }catch(e){
    el.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được danh sách nhà tài trợ.")}</div>`;
  }
}

function openNewSponsor(){
  expandedSponsorKey = "new";
  renderAdminSponsorList();
  document.getElementById(sponsorFieldId("new", "name"))?.focus();
}

function collapseSponsor(){
  expandedSponsorKey = null;
  renderAdminSponsorList();
}

function toggleSponsor(id){
  const key = sponsorFormKey(id);
  expandedSponsorKey = expandedSponsorKey === key ? null : key;
  renderAdminSponsorList();
}

function renderAdminSponsorList(){
  const el = document.getElementById("adminSponsorList");
  if(!el) return;
  const parts = [];

  if(expandedSponsorKey === "new"){
    parts.push(`<div class="sponsorAdminCard expanded">
      <div class="sponsorAdminCardHead"><b>➕ Thêm nhà tài trợ</b></div>
      ${sponsorFormHtml("new", null)}
    </div>`);
  }

  cachedAdminSponsors.forEach(s => {
    const key = sponsorFormKey(s.id);
    const expanded = expandedSponsorKey === key;
    const expired = isSponsorExpired(s);
    const status = !s.active ? "Ẩn" : expired ? "Hết hạn" : "Đang hiện";
    parts.push(`<div class="sponsorAdminCard${expanded ? " expanded" : ""}">
      <div class="sponsorAdminCardHead" onclick="toggleSponsor(${Number(s.id)})">
        <div><b>${escapeHtml(s.name)}</b> <span class="meta">· ${status} · hết hạn ${formatSponsorEndAtLabel(s.end_at)} · #${Number(s.sort_order) || 0}</span>
        <div class="sponsorStatsInline">${formatSponsorStatLabel(s)}</div></div>
        <span class="rosterExpandIcon">${expanded ? "▾" : "▸"}</span>
      </div>
      ${expanded ? sponsorFormHtml(key, s) : ""}
    </div>`);
  });

  if(!parts.length){
    el.innerHTML = `<div class="meta">Chưa có nhà tài trợ. Bấm + Thêm nhà tài trợ.</div>`;
    return;
  }
  el.innerHTML = parts.join("");
}

async function persistSponsorForm(key, silent){
  const form = readSponsorForm(key);
  if(!form.name) return false;
  const payload = {
    session_token: authSession?.token,
    ...form,
    sort_order: Number.isFinite(form.sort_order) ? form.sort_order : 0,
    active: form.active ? 1 : 0
  };
  if(key !== "new"){
    payload.id = Number(key);
    if(!Number.isFinite(payload.id)) return false;
  }
  await apiPost("admin_save_sponsor", payload);
  if(!silent) showToast("Đã lưu nhà tài trợ.", "success");
  expandedSponsorKey = silent ? expandedSponsorKey : null;
  await loadAdminSponsors();
  await loadSponsors();
  return true;
}

async function saveSponsor(key){
  const form = readSponsorForm(key);
  if(!form.name) return alert("Nhập tên nhà tài trợ.");
  try{
    await persistSponsorForm(key, false);
  }catch(e){
    alert(e.message || "Không lưu được nhà tài trợ.");
  }
}

async function deleteSponsor(id, event){
  event?.stopPropagation?.();
  if(!confirm("Xóa nhà tài trợ này?")) return;
  try{
    await apiPost("admin_delete_sponsor", { session_token: authSession?.token, id });
    showToast("Đã xóa nhà tài trợ.", "success");
    expandedSponsorKey = null;
    await loadAdminSponsors();
    await loadSponsors();
  }catch(e){
    alert(e.message || "Không xóa được.");
  }
}

async function handleSponsorImageFile(key, slot, input){
  const file = input?.files?.[0];
  input.value = "";
  if(!file) return;
  const form = readSponsorForm(key);
  if(!form.name) return alert("Nhập tên nhà tài trợ trước khi upload.");
  if(file.size > 2 * 1024 * 1024) return alert("Ảnh tối đa 2MB.");

  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const base64 = String(reader.result || "").split(",")[1] || "";
      const data = await apiPost("admin_upload_sponsor_image", {
        session_token: authSession?.token,
        name: form.name,
        filename_base: form.name,
        upload_kind: slot,
        content_type: file.type || "image/png",
        image_base64: base64
      });
      const field = slot === "mobile" ? "image_mobile" : "image_side";
      const url = data.url || data[field] || "";
      const inputEl = document.getElementById(sponsorFieldId(key, field));
      if(inputEl) inputEl.value = url;
      updateSponsorPreview(key, slot);
      if(key !== "new"){
        await persistSponsorForm(key, true);
        showToast(`Đã upload & lưu banner ${slot === "mobile" ? "mobile" : "dọc"}.`, "success");
      }else{
        showToast(`Đã upload banner ${slot === "mobile" ? "mobile" : "dọc"}. Nhấn Lưu để hiển thị.`, "success");
      }
    }catch(e){
      alert(e.message || "Upload thất bại.");
    }
  };
  reader.readAsDataURL(file);
}
