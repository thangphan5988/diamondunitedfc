/* Login, admin user management */

function permLabelList(perms){
  if(!perms || !perms.length) return "Không có quyền";
  if(perms.includes(PERMS.ALL)) return "Toàn quyền";
  const labels = PERM_OPTIONS.filter(p => p.id !== PERMS.ALL && perms.includes(p.id)).map(p => p.label);
  return labels.length ? labels.join(", ") : perms.join(", ");
}

function initAdminPermGrid(){
  const grid = document.getElementById("adminPermGrid");
  if(!grid) return;
  grid.innerHTML = PERM_OPTIONS.map(p =>
    `<label class="permItem"><input type="checkbox" class="adminPermCb" data-perm="${p.id}"> ${escapeHtml(p.label)}</label>`
  ).join("");
}

function getAdminFormPerms(){
  return [...document.querySelectorAll(".adminPermCb:checked")].map(el => el.dataset.perm);
}

function setAdminFormPerms(perms){
  const set = new Set(perms || []);
  document.querySelectorAll(".adminPermCb").forEach(el => {
    el.checked = set.has(el.dataset.perm) || set.has(PERMS.ALL);
  });
}

function clearAdminUserForm(){
  editingAdminUser = null;
  document.getElementById("adminUsername").value = "";
  document.getElementById("adminUsername").disabled = false;
  document.getElementById("adminDisplayName").value = "";
  document.getElementById("adminPassword").value = "";
  document.getElementById("adminActive").checked = true;
  setAdminFormPerms([]);
}

let editingAdminUser = null;

async function loadAdminUsers(){
  const el = document.getElementById("adminUserList");
  if(!el) return;
  el.innerHTML = `<div class="meta">Đang tải...</div>`;
  try{
    const data = await apiGet("admin_list_users");
    if(!data.users?.length){
      el.innerHTML = `<div class="meta">Chưa có tài khoản.</div>`;
      return;
    }
    el.innerHTML = data.users.map(u => `
      <div class="adminUserRow">
        <div>
          <b>${escapeHtml(u.display_name || u.username)}</b>
          <div class="meta">@${escapeHtml(u.username)} · ${escapeHtml(permLabelList(u.permissions))} · ${u.active ? "Hoạt động" : "Tắt"}</div>
        </div>
        <button class="secondary" style="width:auto;margin:0" onclick="editAdminUser('${escapeAttr(u.username)}')">Sửa</button>
        <button class="danger" style="width:auto;margin:0" onclick="deleteAdminUser('${escapeAttr(u.username)}')">Xóa</button>
      </div>
    `).join("");
  }catch(e){
    el.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được danh sách.")}</div>`;
  }
}

function editAdminUser(username){
  apiGet("admin_list_users").then(data => {
    const user = (data.users || []).find(u => u.username === username);
    if(!user) return;
    editingAdminUser = user.username;
    document.getElementById("adminUsername").value = user.username;
    document.getElementById("adminUsername").disabled = true;
    document.getElementById("adminDisplayName").value = user.display_name || user.username;
    document.getElementById("adminPassword").value = "";
    document.getElementById("adminActive").checked = !!user.active;
    setAdminFormPerms(user.permissions || []);
  }).catch(e => alert(e.message));
}

async function saveAdminUser(){
  const username = document.getElementById("adminUsername").value.trim();
  const displayName = document.getElementById("adminDisplayName").value.trim() || username;
  const password = document.getElementById("adminPassword").value;
  const permissions = getAdminFormPerms();
  const active = document.getElementById("adminActive").checked;
  if(!username) return alert("Nhập username.");
  if(!editingAdminUser && !password) return alert("Mật khẩu bắt buộc khi tạo tài khoản mới.");
  try{
    await apiPost("admin_save_user", { username, display_name: displayName, password, permissions, active });
    clearAdminUserForm();
    await loadAdminUsers();
    alert("Đã lưu tài khoản.");
  }catch(e){
    alert(e.message || "Lưu thất bại.");
  }
}

async function deleteAdminUser(username){
  if(!confirm(`Xóa tài khoản "${username}"?`)) return;
  try{
    await apiPost("admin_delete_user", { username });
    if(editingAdminUser === username) clearAdminUserForm();
    await loadAdminUsers();
  }catch(e){
    alert(e.message || "Xóa thất bại.");
  }
}

function openLoginModal(){
  document.getElementById("loginError").style.display = "none";
  document.getElementById("loginUsername").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginModal").classList.add("show");
  syncModalOpenState();
}

function closeLoginModal(){
  document.getElementById("loginModal").classList.remove("show");
  syncModalOpenState();
}

async function adminLogin(){
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  const btn = document.getElementById("btnDoLogin");
  errEl.style.display = "none";
  if(!username || !password){
    errEl.textContent = "Nhập username và password.";
    errEl.style.display = "block";
    return;
  }
  btn.disabled = true;
  try{
    const data = await apiPost("admin_login", { username, password });
    authSession = {
      token: data.token,
      expires_at: data.expires_at,
      username: data.username,
      display_name: data.display_name || data.username,
      permissions: data.permissions || []
    };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession));
    closeLoginModal();
    applyAuthUI();
    if(shouldRestorePending()){
      await restorePendingMatchIfAny();
    }
    if(canUseLineupTab()){
      switchTab("lineup");
      startConfirmPolling();
    }
  }catch(e){
    errEl.textContent = e.message || "Đăng nhập thất bại.";
    errEl.style.display = "block";
  }finally{
    btn.disabled = false;
  }
}

async function adminLogout(){
  try{
    if(authSession?.token) await apiPost("admin_logout", {});
  }catch(e){
    console.error(e);
  }
  authSession = null;
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(PENDING_MATCH_KEY);
  unlockMatchState();
  applyAuthUI();
  switchTab("latest");
}

function updateResultModalPerms(){
  const canResult = isLoggedIn() && canEnterAnyResult();
  const canCancel = isLoggedIn() && hasPerm(PERMS.CANCEL_MATCH);
  if(matchLocked) updateLockBannerContent();
  const cancelBtn = document.getElementById("btnCancelMatch");
  if(cancelBtn) cancelBtn.style.display = canCancel ? "" : "none";
  const saveBtn = document.getElementById("btnSaveResult");
  if(saveBtn){
    saveBtn.style.display = canResult ? "" : "none";
    if(canFinalizeMatch() && isCapMode()){
      saveBtn.textContent = "Xác nhận trận đấu";
      saveBtn.classList.remove("btnDone");
      saveBtn.disabled = !capHlvResultConfirmed();
      saveBtn.title = capHlvResultConfirmed() ? "" : "Chờ HLV Cáp xác nhận KQ";
    }else if(canFinalizeMatch()){
      saveBtn.textContent = "Xác nhận trận đấu";
      saveBtn.classList.remove("btnDone");
      saveBtn.disabled = !bothTeamsResultSaved();
      saveBtn.title = bothTeamsResultSaved() ? "" : "Chờ 2 HLV xác nhận KQ";
    }else if(canResultTeamA() && !canResultTeamB()){
      saveBtn.textContent = teamResultSaved.A ? "✓ Đã xác nhận Đội A" : "✓ Xác nhận Đội A";
      if(teamResultSaved.A){
        saveBtn.classList.add("btnDone");
        saveBtn.disabled = true;
      }else{
        saveBtn.classList.remove("btnDone");
        saveBtn.disabled = false;
      }
    }else if(canResultTeamB() && !canResultTeamA()){
      saveBtn.textContent = teamResultSaved.B ? "✓ Đã xác nhận Đội B" : "✓ Xác nhận Đội B";
      if(teamResultSaved.B){
        saveBtn.classList.add("btnDone");
        saveBtn.disabled = true;
      }else{
        saveBtn.classList.remove("btnDone");
        saveBtn.disabled = false;
      }
    }else if(isCapHlvResultOnly()){
      saveBtn.textContent = capHlvResultConfirmed() ? "✓ Đã xác nhận HLV Cáp" : "✓ Xác nhận HLV Cáp";
      if(capHlvResultConfirmed()){
        saveBtn.classList.add("btnDone");
        saveBtn.disabled = true;
      }else{
        saveBtn.classList.remove("btnDone");
        saveBtn.disabled = false;
      }
    }else{
      saveBtn.textContent = "Lưu kết quả trận";
      saveBtn.classList.remove("btnDone");
      saveBtn.disabled = false;
    }
  }
}

function applyAuthUI(){
  const loggedIn = isLoggedIn();
  const label = document.getElementById("authUserLabel");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const tabLineup = document.getElementById("tabLineup");
  const tabAdmin = document.getElementById("tabAdmin");
  const showLineup = loggedIn && canUseLineupTab();

  if(loggedIn){
    label.textContent = `Đăng nhập: ${authSession.display_name || authSession.username} · ${permLabelList(authSession.permissions)}`;
    btnLogin.style.display = "none";
    btnLogout.style.display = "";
  }else{
    label.textContent = "Chế độ xem công khai — đăng nhập để quản lý trận";
    btnLogin.style.display = "";
    btnLogout.style.display = "none";
    document.getElementById("lockBanner").classList.remove("show");
  }

  if(tabLineup){
    tabLineup.style.display = showLineup ? "" : "none";
    tabLineup.textContent = getLineupTabLabel();
  }
  tabAdmin.style.display = loggedIn && canAccessAdminTab() ? "" : "none";

  if(showLineup){
    const showInternal = isFullLineupRole() || canSplitTeams() || canManageTeamA() || canManageTeamB();
    document.getElementById("modeInternal").style.display = showInternal ? "" : "none";
    document.getElementById("modeCap").style.display = (canCoordinateCap() || canCapHlvEdit() || isFullLineupRole()) ? "" : "none";
    document.getElementById("btnRandom").style.display =
      canSplitTeams() && lineupMode === "internal" && !matchLocked && !lastResult ? "" : "none";
    document.getElementById("btnOptimizeCap").style.display =
      canCoordinateCap() && lineupMode === "cap" ? "" : "none";

    if(lineupMode === "internal" && !showInternal && canCapHlvEdit()){
      switchLineupMode("cap", true);
    }else if(lineupMode === "internal" && !showInternal && canCoordinateCap()){
      switchLineupMode("cap", true);
    }else if(lineupMode === "cap" && !canManageCapLineup() && showInternal){
      switchLineupMode("internal", true);
    }
    applyLineupRoleUI();
  }

  if(document.getElementById("tabLineup").classList.contains("active") && !showLineup) switchTab("latest");
  if(document.getElementById("tabAdmin").classList.contains("active") && !canAccessAdminTab()) switchTab("latest");

  const adminTabs = document.getElementById("adminSectionTabs");
  const adminUsersPanel = document.getElementById("adminUsersPanel");
  const adminRosterPanel = document.getElementById("adminRosterPanel");
  const adminTabUsers = document.getElementById("adminTabUsers");
  const adminTabRoster = document.getElementById("adminTabRoster");
  if(adminTabs){
    const showUsers = canManageUsers();
    const showRoster = canManageRoster();
    adminTabs.style.display = showUsers && showRoster ? "" : "none";
    if(adminTabUsers) adminTabUsers.style.display = showUsers ? "" : "none";
    if(adminTabRoster) adminTabRoster.style.display = showRoster ? "" : "none";
    if(adminUsersPanel) adminUsersPanel.style.display = showUsers ? "" : "none";
    if(adminRosterPanel && showRoster && !showUsers) adminRosterPanel.style.display = "";
  }

  updateResultModalPerms();
  if(matchLocked) applyLockUI(true);
  if(document.getElementById("tabHistory").classList.contains("active")) loadMatchHistory();
}

async function initAuth(){
  initAdminPermGrid();
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if(raw){
    try{
      const saved = JSON.parse(raw);
      if(saved?.token){
        const data = await apiGet("admin_validate_session", { session_token: saved.token });
        if(data.valid){
          authSession = {
            token: saved.token,
            expires_at: data.expires_at,
            username: data.username,
            display_name: data.display_name || data.username,
            permissions: data.permissions || []
          };
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession));
        }else{
          localStorage.removeItem(AUTH_SESSION_KEY);
          authSession = null;
        }
      }
    }catch(e){
      console.error(e);
      authSession = null;
    }
  }
  loadTeamWorkflowState();
  applyAuthUI();
}
