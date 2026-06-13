/* App bootstrap */

window.addEventListener("DOMContentLoaded", async () => {
  await loadDefaultRoster();
  await initAuth();
  await loadLatestMatch();
  if(shouldRestorePending()){
    await restorePendingMatchIfAny();
  }
  if(shouldPollPendingMatch()){
    startConfirmPolling();
  }
  applyLineupRoleUI();
  initFormationSegControls();
  initLineupTeamSwitchers();
  initMatchStartTimeSelect();
  initMatchVenueLine();
  initFriendlyMatchButton();
  initSiteAnalytics();
  loadSponsors();
});
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && shouldPollPendingMatch() &&
    !(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult())){
    refreshTeamConfirmFromServer();
  }
});
