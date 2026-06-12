/* Cloudflare / legacy API client */

function apiUrlCandidates(){
  const urls = [];
  if(MATCH_HISTORY_WEB_APP_URL) urls.push(MATCH_HISTORY_WEB_APP_URL);
  if(typeof API_FALLBACK_URL === "string" && API_FALLBACK_URL && !urls.includes(API_FALLBACK_URL))
    urls.push(API_FALLBACK_URL);
  return urls;
}

async function apiFetch(buildUrl, options){
  const candidates = apiUrlCandidates();
  let lastErr;
  for(let i = 0; i < candidates.length; i++){
    const base = candidates[i];
    try{
      const res = await fetch(buildUrl(base), options);
      if(!res.ok) throw new Error("API HTTP " + res.status);
      return res;
    }catch(e){
      lastErr = e;
      if(i < candidates.length - 1)
        console.warn("API retry via fallback:", base, e.message || e);
    }
  }
  throw lastErr || new Error("API unavailable");
}

async function apiPost(action, payload){
  const body = Object.assign({action}, payload || {});
  if(authSession?.token) body.session_token = authSession.token;
  const res = await apiFetch(
    (base) => base,
    {
      method: "POST",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify(body)
    }
  );
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}

async function apiGet(action, params){
  const query = Object.assign({action}, params || {}, {ts: Date.now()});
  if(authSession?.token) query.session_token = authSession.token;
  const qs = new URLSearchParams(query);
  const res = await apiFetch(
    (base) => base + "?" + qs.toString(),
    {cache: "no-store"}
  );
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}
