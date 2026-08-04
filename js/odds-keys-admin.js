/* Admin Odds API keys — paste list, auto-rotate when quota hết */

async function loadAdminOddsKeysPanel(){
  const status = document.getElementById("oddsKeysStatus");
  const ta = document.getElementById("oddsKeysText");
  const list = document.getElementById("oddsKeysMeta");
  if(status) status.textContent = "Đang tải...";
  try{
    const data = await apiGet("admin_list_odds_keys", { session_token: authSession?.token });
    if(ta) ta.value = data.admin_keys_text || "";
    if(list){
      const rows = (data.keys || []).map(k => {
        const src = k.source === "env" ? "secret" : "admin";
        const st = k.dead ? "hết quota" : "ok";
        return `<li><code>${escapeHtml(k.hint)}</code> · ${src} · ${st}</li>`;
      }).join("");
      list.innerHTML = `
        <div class="meta" style="margin-bottom:8px">
          Tổng ${Number(data.total || 0)} key · dùng được ${Number(data.usable || 0)}
          · admin ${Number(data.admin_count || 0)} · secret ${Number(data.env_count || 0)}
          ${data.quota_blocked ? " · <b>đang khóa quota (fallback)</b>" : ""}
        </div>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.6">${rows || "<li>Chưa có key</li>"}</ul>
      `;
    }
    if(status) status.textContent = "";
  }catch(err){
    if(status) status.textContent = err.message || "Không tải được danh sách key.";
  }
}

async function saveAdminOddsKeysPanel(){
  const status = document.getElementById("oddsKeysStatus");
  const ta = document.getElementById("oddsKeysText");
  const btn = document.getElementById("oddsKeysSaveBtn");
  if(btn) btn.disabled = true;
  if(status) status.textContent = "Đang lưu...";
  try{
    const data = await apiPost("admin_save_odds_keys", {
      session_token: authSession?.token,
      keys_text: ta?.value || ""
    });
    if(ta) ta.value = data.admin_keys_text || "";
    await loadAdminOddsKeysPanel();
    if(status) status.textContent = data.message || "Đã lưu.";
  }catch(err){
    if(status) status.textContent = err.message || "Lưu thất bại.";
  }finally{
    if(btn) btn.disabled = false;
  }
}
