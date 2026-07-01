/* Cloudflare / legacy API client */

async function apiPost(action, payload){
  const body = Object.assign({action}, payload || {});
  if(authSession?.token) body.session_token = authSession.token;
  const res = await fetch(MATCH_HISTORY_WEB_APP_URL, {
    method: "POST",
    headers: {"Content-Type": "text/plain;charset=utf-8"},
    body: JSON.stringify(body)
  });
  let data;
  try{
    data = await res.json();
  }catch(_e){
    if(!res.ok) throw new Error("API HTTP " + res.status);
    throw new Error("API phản hồi không hợp lệ.");
  }
  if(!res.ok) throw new Error(data?.error || "API HTTP " + res.status);
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}

async function apiGet(action, params){
  const query = Object.assign({action}, params || {}, {ts: Date.now()});
  if(authSession?.token) query.session_token = authSession.token;
  const qs = new URLSearchParams(query);
  const res = await fetch(MATCH_HISTORY_WEB_APP_URL + "?" + qs.toString(), {cache: "no-store"});
  let data;
  try{
    data = await res.json();
  }catch(_e){
    if(!res.ok) throw new Error("API HTTP " + res.status);
    throw new Error("API phản hồi không hợp lệ.");
  }
  if(!res.ok) throw new Error(data?.error || "API HTTP " + res.status);
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}
