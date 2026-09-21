'use strict';
const $ = id => document.getElementById(id);
let config, dataset = {posts: []};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '확인 불가';
const day = value => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function safeURL(value) { try {const u = new URL(value);return ['https:','http:'].includes(u.protocol) ? u.href : '#';} catch {return '#';} }
function show(view) {
  $('feed-view').hidden = view !== 'feed'; $('settings-view').hidden = view !== 'settings';
  $('view-name').textContent = view === 'feed' ? '수요 레이더' : '검색 설정';
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === view));
}
document.addEventListener('click', event => {const b=event.target.closest('[data-view]');if(b) show(b.dataset.view);});
function render() {
  const term = $('search').value.trim().toLowerCase();
  const posts = dataset.posts.filter(p => (!term || `${p.title} ${p.excerpt} ${(p.keywords || []).join(' ')}`.toLowerCase().includes(term)) && (!$('source').value || p.source === $('source').value) && p.score >= Number($('score').value));
  posts.sort((a,b) => $('sort').value === 'score' ? b.score-a.score : b.first_seen.localeCompare(a.first_seen));
  $('count').textContent = posts.length;
  $('posts').innerHTML = posts.length ? posts.map(p => `<article class="post"><div><div class="post-meta"><span class="channel">${esc(p.source)}</span><span>처음 발견 ${esc(date(p.first_seen))}</span></div><h3><a href="${esc(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">${esc(p.title)} ↗</a></h3><p>${esc(p.excerpt)}</p><div class="tags">${(p.reasons || []).map(r=>`<span class="tag">${esc(r)}</span>`).join('')}${(p.keywords || []).map(r=>`<span class="tag"># ${esc(r)}</span>`).join('')}</div><div class="post-dates">원문 날짜 ${esc(date(p.source_date))} · 최근 발견 ${esc(date(p.last_seen))}<br>원문 날짜는 검색엔진 제공 정보이며 게시·수정 여부를 구분하지 못할 수 있습니다.</div></div><div class="rank ${p.score>=75?'high':''}">관련도<strong>${Number(p.score)}</strong>/ 100</div></article>`).join('') : `<div class="empty"><div class="symbol">◎</div><h3>${dataset.posts.length ? '조건에 맞는 게시글이 없습니다' : '첫 번째 수요 신호를 기다리고 있어요'}</h3><p>${dataset.posts.length ? '검색어나 필터를 바꾸어 다시 확인해보세요.' : '검색 설정과 API 연결을 마치면 발견한 게시글이 여기에 쌓입니다. 실제로 수집하기 전까지 예시 게시글을 표시하지 않습니다.'}</p><button class="button secondary" data-view="settings">검색 설정 확인 ↗</button></div>`;
}
function renderSettings() {
  $('keywords').value = config.keywords.join('\n'); $('exclude').value = config.exclude.join('\n');
  $('freshness').value = config.freshness; $('min-score').value = config.min_score;
  $('sources').innerHTML = config.sources.map((s,i)=>`<label class="source-check"><input type="checkbox" data-source="${i}" ${s.enabled?'checked':''}><span>${esc(s.name)}<small>${esc(s.domain)}</small></span></label>`).join('');
  $('budget').textContent = `실행당 최대 ${config.max_queries}회 검색 · 결과 ${config.retention_days}일 보관. 검색 조합이 한도를 넘으면 순환 수집합니다.`;
  const match = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (match) $('repo').value = `${match[1]}/${location.pathname.split('/').filter(Boolean)[0] || match[1]+'.github.io'}`;
}
async function load() {
  $('refresh').disabled = true;
  try {
    const [pr, cr] = await Promise.all([fetch('data/posts.json', {cache:'no-store'}), fetch('data/config.json', {cache:'no-store'})]);
    if (!pr.ok || !cr.ok) throw new Error('수집 결과 또는 설정 파일을 불러오지 못했습니다.');
    dataset = await pr.json(); const fetchedConfig = await cr.json();
    if (!Array.isArray(dataset.posts)) throw new Error('결과 파일 형식이 올바르지 않습니다.');
    if (!config) {config=fetchedConfig;renderSettings();}
    const messages={not_configured:'연결 대기 · 검색 API 키와 저장 권한을 설정하면 자동 수집을 시작합니다.',ok:'수집 완료 · 하루 두 번 새로운 수요를 확인합니다.',partial:'일부 검색에 실패했습니다. 성공한 결과와 기존 결과를 함께 표시합니다.',error:'수집에 실패했습니다. 기존 결과를 유지하고 있습니다. GitHub Actions 실행 기록을 확인하세요.'};
    $('status').textContent = (messages[dataset.status] || '수집 상태를 확인하세요.') + (dataset.last_attempt ? ` 최근 시도 ${date(dataset.last_attempt)} KST · 검색 ${dataset.queries}회` : '');
    if (dataset.last_success && Date.now()-Date.parse(dataset.last_success)>26*3600000) $('status').textContent += ' · 26시간 이상 새 수집이 없습니다. 예약 실행을 확인하세요.';
    $('total').textContent = dataset.posts.length;
    $('today').textContent = dataset.posts.filter(p=>day(p.first_seen)===day(new Date())).length;
    $('high').textContent = dataset.posts.filter(p=>p.score>=75).length;
    $('last').textContent = dataset.last_success ? date(dataset.last_success) : '아직 없음';
    const selected=$('source').value;
    $('source').innerHTML='<option value="">전체 채널</option>'+[...new Set(dataset.posts.map(p=>p.source))].map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    $('source').value=selected; render();
  } catch(e) { $('status').textContent='불러오기 실패 · '+e.message; } finally {$('refresh').disabled=false;}
}
function editedConfig() {
  if (!config) throw new Error('설정을 먼저 불러와 주세요.');
  const lines=id=>[...new Set($(id).value.split('\n').map(s=>s.trim()).filter(Boolean))];
  const c={...config,keywords:lines('keywords'),exclude:lines('exclude'),freshness:$('freshness').value,min_score:Number($('min-score').value),sources:config.sources.map((s,i)=>({...s,enabled:document.querySelector(`[data-source="${i}"]`).checked}))};
  if(!c.keywords.length || c.keywords.length>30 || [...c.keywords,...c.exclude].some(s=>s.length>200)) throw new Error('검색어는 1~30개, 각 표현은 200자 이하여야 합니다.');
  if(!c.sources.some(s=>s.enabled)) throw new Error('채널을 하나 이상 선택하세요.');
  if(!Number.isInteger(c.min_score)||c.min_score<0||c.min_score>100) throw new Error('관련도는 0~100 정수로 입력하세요.');
  return c;
}
async function github(path, token, options={}) {
  const res=await fetch(`https://api.github.com/repos/${path}`,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}});
  if(!res.ok) throw new Error(`GitHub ${res.status}: ${res.status===409?'설정이 변경되었습니다. 페이지를 새로고침한 뒤 다시 저장하세요.':res.status===401||res.status===403?'토큰과 저장소 권한을 확인하세요.':'저장소와 main 브랜치, Actions 설정을 확인하세요.'}`);
  return res.status===204?null:res.json();
}
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault(); const button=event.submitter; button.disabled=true; let saved=false;
  try {
    const c=editedConfig(),repo=$('repo').value.trim(),token=$('token').value.trim();
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!token) throw new Error('저장소 주소(owner/repository)와 GitHub 토큰을 입력하세요.');
    $('save-status').textContent='GitHub에 설정을 저장하고 있습니다…';
    const current=await github(`${repo}/contents/config.json?ref=main`,token);
    const bytes=new TextEncoder().encode(JSON.stringify(c,null,2)+'\n');
    await github(`${repo}/contents/config.json`,token,{method:'PUT',body:JSON.stringify({message:'Update monitoring preferences',content:btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')),sha:current.sha,branch:'main'})});
    config=c;saved=true;
    $('save-status').textContent='설정을 저장했습니다. 수집 실행을 요청하고 있습니다…';
    // The commit starts the push workflow. No second dispatch is needed.
    $('save-status').textContent='저장 완료 · 설정 변경으로 GitHub Actions 수집이 시작됩니다. 완료 후 결과 새로고침을 눌러주세요.';
    $('token').value='';
  } catch(e) {$('save-status').textContent=(saved?'설정은 저장되었습니다. ':'')+e.message;} finally {button.disabled=false;}
});
$('download').addEventListener('click',()=>{try{const c=editedConfig(),url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('save-status').textContent='내려받은 config.json을 GitHub 저장소 루트에 업로드하면 다음 수집에 반영됩니다.';}catch(e){$('save-status').textContent=e.message;}});
['search','source','score','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('refresh').addEventListener('click',load);
load();
