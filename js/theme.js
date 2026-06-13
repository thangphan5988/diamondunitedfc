/* Theme — auto 6h–18h (UTC+7) + nút chuyển tay */

const THEME_KEY = "dufc_theme";
const VN_UTC_OFFSET_H = 7;
const DAY_START_H = 6;
const DAY_END_H = 18;

function getVietnamHour(){
  const now = new Date();
  return (now.getUTCHours() + VN_UTC_OFFSET_H + 24) % 24;
}

function getAutoThemeByTime(){
  const h = getVietnamHour();
  return h >= DAY_START_H && h < DAY_END_H ? "light" : "dark";
}

function getStoredThemeMode(){
  try{
    const v = localStorage.getItem(THEME_KEY);
    if(v === "light" || v === "dark" || v === "auto") return v;
    return "auto";
  }catch(_e){
    return "auto";
  }
}

function resolveTheme(){
  const mode = getStoredThemeMode();
  if(mode === "light" || mode === "dark") return mode;
  return getAutoThemeByTime();
}

function applyTheme(theme){
  const isLight = theme === "light";
  const root = document.documentElement;
  if(isLight) root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");

  const mode = getStoredThemeMode();
  const btn = document.getElementById("themeToggle");
  if(btn){
    const autoHint = mode === "auto" ? " · tự động 6h–18h (VN)" : "";
    btn.setAttribute(
      "aria-label",
      isLight ? `Chuyển giao diện tối${autoHint}` : `Chuyển giao diện sáng${autoHint}`
    );
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if(themeMeta) themeMeta.setAttribute("content", isLight ? "#d4e4f2" : "#07111f");
}

function toggleTheme(){
  const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  const autoTheme = getAutoThemeByTime();
  const mode = next === autoTheme ? "auto" : next;
  try{ localStorage.setItem(THEME_KEY, mode); }catch(_e){}
  applyTheme(next);
  if(typeof trackSiteInteraction === "function"){
    trackSiteInteraction("theme_toggle", { theme: next, mode });
  }
}

function initTheme(){
  applyTheme(resolveTheme());
  setInterval(() => {
    if(getStoredThemeMode() === "auto") applyTheme(getAutoThemeByTime());
  }, 60000);
}

initTheme();
