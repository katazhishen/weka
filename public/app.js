// weka 前端（零依赖 SPA）
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]

/* ---------------- 图标 ---------------- */
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-6.5A8 8 0 1 1 21 12Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18-2.5-2.6-2.5-15.4 0-18Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M18 20a5.5 5.5 0 0 0-3-4.9"/>',
  report: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.4 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4Z"/>',
  collapse: '<path d="m14 6-6 6 6 6"/><path d="M20 4v16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 4.5-4.5L13 17l3-3 4 4"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/>',
  music: '<circle cx="7" cy="17" r="3"/><path d="M10 17V6l9-2v9"/><circle cx="16" cy="15" r="3"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
}
const icon = (n) => `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`

/* ---------------- 状态 ---------------- */
const S = {
  meta: null,
  sessions: [],
  keyword: '',
  route: 'home',
  account: localStorage.getItem('weka.account') || '',
  theme: localStorage.getItem('weka.theme') || 'light',
  myName: '',
  chat: { current: null, oldest: null, hasMore: false, loading: false, recalled: [], showRecalled: localStorage.getItem('weka.showRecalled') === '1' },
  mom: { keyword: '', from: '', to: '', contact: '', offset: 0, items: [] },
  pick: { p2p: null, group: null, annualYear: null },
  exp: { selected: new Set(), filter: 'all', from: '', to: '' },
  setTab: 'appearance',
}

/* ---------------- 工具 ---------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmtInt = (n) => (n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : String(n ?? 0))
const fmtSize = (b) => (b > 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB')
const fmtTime = (ms) => {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? `${md} ${hm}` : `${d.getFullYear()}/${md}`
}
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('zh-CN') : '-')
const dayLabel = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` }
const initial = (n) => ((String(n || '?').replace(/[^\p{L}\p{N}]/gu, '')[0]) || '#').toUpperCase()

function avatarHtml(username, name, cls = 'avatar') {
  const src = username ? `/api/avatar?username=${encodeURIComponent(username)}${S.account ? `&account=${encodeURIComponent(S.account)}` : ''}` : ''
  return `<div class="${cls}">${esc(initial(name))}${src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()" />` : ''}</div>`
}

async function api(path, params = {}) {
  const u = new URL(path, location.origin)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v)
  if (S.account && !u.searchParams.has('account')) u.searchParams.set('account', S.account)
  const r = await fetch(u)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
  return r.json()
}

function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 1900)
}

const loadingHtml = (text = '加载中…') => `<div class="loading"><div class="spinner"></div>${esc(text)}</div>`

/* 环形图（SVG，纯 CSS 动画） */
function donut(items, { size = 168, inner = 0.62 } = {}) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1
  const r = size / 2
  const stroke = (size / 2) * (1 - inner)
  const radius = r - stroke / 2
  const c = 2 * Math.PI * radius
  let acc = 0
  const segs = items
    .filter((x) => x.value > 0)
    .map((x) => {
      const frac = x.value / total
      const dash = `${frac * c} ${c}`
      const offset = -acc * c
      acc += frac
      return `<circle cx="${r}" cy="${r}" r="${radius}" fill="none" stroke="${x.color}" stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" transform="rotate(-90 ${r} ${r})" />`
    })
    .join('')
  const legend = items
    .filter((x) => x.value > 0)
    .map(
      (x) => `<div class="legend-row"><span class="legend-dot" style="background:${x.color}"></span>
        <span class="legend-label">${esc(x.label)}</span>
        <span class="spacer"></span>
        <span class="legend-val">${((x.value / total) * 100).toFixed(1)}%</span></div>`
    )
    .join('')
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex:none">${segs}</svg>
    <div class="donut-legend">${legend}</div>
  </div>`
}

const PALETTE = ['#4a5fc1', '#22a06b', '#60c0de', '#a8c94a', '#e0b64a', '#d9734a', '#b06ab3', '#8b8578']

/* ---------------- 会话缓存 ---------------- */
async function ensureSessions(force = false) {
  if (S.sessions.length && !force) return S.sessions
  const { sessions } = await api('/api/sessions', { limit: 600 })
  S.sessions = sessions
  return sessions
}

/* ================= 首页 ================= */
async function pageHome(el) {
  el.innerHTML = loadingHtml()
  const [meta, home] = await Promise.all([api('/api/meta'), api('/api/home')])
  S.meta = meta
  S.myName = meta.myName || meta.myWxid
  const me = home.account.myWxid
  el.innerHTML = `
    <div class="hero">
      <div class="hero-card">
        ${avatarHtml(me, S.myName, 'hero-avatar')}
        <div class="hero-meta">
          <div class="hero-name">${esc(S.myName)}</div>
          <span class="chip">✓ 已连接</span>
        </div>
      </div>
      <div class="muted" style="font-size:12px">${esc(home.account.wxid)} · 数据目录 ${esc(meta.account.dbPath)}</div>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">会话</div><div class="stat-value">${fmtInt(home.sessionCount)}</div><div class="stat-sub">群聊 ${home.groupCount}</div></div>
      <div class="stat"><div class="stat-label">联系人</div><div class="stat-value">${fmtInt(home.contactCount)}</div><div class="stat-sub">来自 contact.db</div></div>
      <div class="stat"><div class="stat-label">未读</div><div class="stat-value">${fmtInt(home.unread)}</div><div class="stat-sub">全部会话合计</div></div>
      <div class="stat"><div class="stat-label">数据跨度</div><div class="stat-value" style="font-size:15px">${fmtDate(home.firstMs)}</div><div class="stat-sub">→ ${fmtDate(home.lastMs)}</div></div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="card-title">${icon('chat')}最近活跃</div>
        ${home.topSessions.map((s) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)">
          ${avatarHtml(s.username, s.name, 'avatar-sm')}
          <span style="font-weight:600;font-size:13px">${esc(s.name)}</span>${s.isGroup ? '<span class="badge">群</span>' : ''}
          <span class="spacer"></span><span class="muted" style="font-size:12px">${esc(fmtTime(s.timeMs))}</span></div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">${icon('report')}能力状态</div>
        <div class="tips">
          <div class="tip">数据库解密：${meta.sessionCount ? '<b style="color:var(--primary)">正常</b>' : '异常'}</div>
          <div class="tip">聊天图片解密：${meta.imageKeys ? '<b style="color:var(--primary)">已配置密钥</b>' : '未配置'}</div>
          <div class="tip">WXGF→图片转码：${meta.ffmpeg ? '<b style="color:var(--primary)">ffmpeg 就绪</b>' : '缺少 ffmpeg'}</div>
          <div class="tip">防撤回：旁路归档持续记录中（不改动微信数据库）</div>
          <div class="tip">语音转文字：需下载 SenseVoice 模型（设置 → 语音转文字）</div>
        </div>
      </div>
    </div>`
}

/* ================= 聊天 ================= */
async function pageChat(el) {
  el.classList.add('narrow')
  el.innerHTML = loadingHtml()
  await ensureSessions()
  // 深链接：#/chat/<username>
  const deep = (location.hash || '').match(/^#\/chat\/(.+)$/)
  if (deep) {
    const u = decodeURIComponent(deep[1])
    S.chat.current = S.sessions.find((x) => x.username === u) || { username: u, name: u, isGroup: u.endsWith('@chatroom') }
  }
  el.innerHTML = `
    <div class="split">
      <div class="split-side">
        <div class="pad"><input class="input w-full" id="chat-search" placeholder="搜索会话 / 联系人" value="${esc(S.keyword)}" /></div>
        <div class="scroll-y" id="session-list"></div>
      </div>
      <div class="split-main">
        <div class="chat-head">
          <div>
            <div class="chat-title" id="chat-title">选择一个会话</div>
            <div class="chat-sub" id="chat-sub"></div>
          </div>
          <div class="row">
            <input class="input input-sm" id="msg-search" placeholder="搜索本会话（含语音转写）…" />
            <label class="switch" title="显示已撤回的消息">
              <input type="checkbox" id="recall-toggle" ${S.chat.showRecalled ? 'checked' : ''} />
              <span class="switch-track"><span class="switch-thumb"></span></span>
              <span class="switch-label">防撤回</span>
            </label>
            <span class="perf" id="perf"></span>
          </div>
        </div>
        <div class="scroll-y messages" id="messages"><div class="empty">← 从左侧选择会话开始浏览</div></div>
        <div class="chat-foot">
          <button class="btn" id="load-earlier" disabled>载入更早的消息</button>
          <button class="btn" id="transcribe-all" disabled>${icon('music')}转写本会话语音</button>
          <span class="muted" style="font-size:12px" id="chat-status"></span>
        </div>
      </div>
    </div>`
  renderSessionList()
  $('#chat-search').addEventListener('input', (e) => { S.keyword = e.target.value; renderSessionList() })
  $('#load-earlier').addEventListener('click', () => loadEarlier())
  $('#messages').addEventListener('scroll', () => {
    const box = $('#messages')
    if (box.scrollTop < 60 && S.chat.hasMore && !S.chat.loading) loadEarlier()
  })
  $('#recall-toggle').addEventListener('change', (e) => {
    S.chat.showRecalled = e.target.checked
    localStorage.setItem('weka.showRecalled', e.target.checked ? '1' : '0')
    if (S.chat.current) openSession(S.chat.current.username)
  })
  $('#msg-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchInSession(e.target.value.trim())
    if (e.key === 'Escape') { e.target.value = ''; if (S.chat.current) openSession(S.chat.current.username) }
  })
  $('#transcribe-all').addEventListener('click', () => transcribeSession())
  if (S.chat.current) openSession(S.chat.current.username)
}

async function searchInSession(keyword) {
  if (!S.chat.current) return
  if (!keyword) return openSession(S.chat.current.username)
  const box = $('#messages')
  box.innerHTML = loadingHtml('搜索中…')
  try {
    const r = await api('/api/search', { q: keyword, username: S.chat.current.username, limit: 80 })
    if (!r.hits.length) {
      box.innerHTML = `<div class="empty">没有找到「${esc(keyword)}」<br/><span style="font-size:12px">语音消息需要先转写才能被搜到</span></div>`
      return
    }
    box.innerHTML = `<div class="search-head">找到 ${r.count} 条 · ${r.ms}ms
      <button class="btn btn-xs" id="search-back">返回消息</button></div>` +
      r.hits.map((h) => `<div class="search-hit">
        <span class="chip plain tiny">${h.kind === 'voice' ? '语音' : h.kind === 'text' ? '文本' : esc(h.kind)}</span>
        <span class="search-text">${highlight(esc(h.text), keyword)}</span>
        <span class="muted" style="font-size:11px">${h.timeMs ? esc(fmtTime(h.timeMs)) : ''}</span>
      </div>`).join('')
    $('#search-back').addEventListener('click', () => openSession(S.chat.current.username))
  } catch (e) {
    box.innerHTML = `<div class="empty">搜索失败：${esc(e.message)}</div>`
  }
}

const highlight = (text, kw) => {
  const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(safe, 'gi'), (m) => `<mark>${m}</mark>`)
}

async function transcribeSession() {
  if (!S.chat.current) return
  const btn = $('#transcribe-all')
  const status = $('#chat-status')
  btn.disabled = true
  const orig = btn.innerHTML
  status.textContent = '语音转写中…（本地模型，不联网）'
  try {
    const r = await api('/api/transcribe', { username: S.chat.current.username, limit: 60 })
    status.textContent = `语音 ${r.total} 条 · 本次转写 ${r.processed} 条 · ${r.ms}ms`
    toast(`已转写 ${r.processed} 条语音`)
    await openSession(S.chat.current.username)
  } catch (e) {
    status.textContent = '转写失败：' + e.message
  } finally {
    btn.disabled = false
    btn.innerHTML = orig
  }
}

function renderSessionList() {
  const list = $('#session-list')
  if (!list) return
  const kw = S.keyword.trim().toLowerCase()
  const items = kw ? S.sessions.filter((s) => (s.name + ' ' + s.username + ' ' + (s.summary || '')).toLowerCase().includes(kw)) : S.sessions
  list.innerHTML = items.map((s) => `<div class="session${S.chat.current?.username === s.username ? ' active' : ''}" data-u="${esc(s.username)}">
      ${avatarHtml(s.username, s.name)}
      <div class="session-main">
        <div class="session-name"><span class="name">${esc(s.name)}</span>${s.isGroup ? '<span class="badge">群</span>' : ''}</div>
        <div class="session-summary">${esc(s.summary || '')}</div>
      </div>
      <div class="session-meta">${esc(fmtTime(s.timeMs))}${s.unread ? `<div class="unread">${s.unread > 99 ? '99+' : s.unread}</div>` : ''}</div>
    </div>`).join('')
  $$('.session', list).forEach((n) => n.addEventListener('click', () => openSession(n.dataset.u)))
}

function messageHtml(m, prevTime) {
  const sep = !prevTime || dayLabel(prevTime) !== dayLabel(m.timeMs) ? `<div class="day-sep">${esc(dayLabel(m.timeMs))}</div>` : ''
  const who = m.isMine ? '我' : m.senderName || m.sender || '?'

  if (m.recalled) {
    return sep + `<div class="msg system"><div class="bubble recall-bubble">
      <span class="recall-tag">已撤回</span>${esc(who)}：${esc(m.text || '')}</div></div>`
  }
  if (m.kind === 'system' || m.type === 10000) {
    return sep + `<div class="msg system"><div class="bubble">${esc(m.text || m.label)}</div></div>`
  }
  let body
  if (m.imageMd5) {
    const src = `/api/image?md5=${m.imageMd5}${S.account ? `&account=${encodeURIComponent(S.account)}` : ''}`
    body = `<img class="msg-image" src="${src}" loading="lazy" data-full="${src}" alt="图片"
      onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'img-fail',textContent:'图片未缓存在本地'}))" />`
  } else if (m.type === 34 || m.kind === 'voice') {
    const secs = m.durationMs ? (m.durationMs / 1000).toFixed(1) : ''
    const hasText = Boolean(m.transcript)
    body = `<div class="voice-msg">
      <span class="voice-icon">${icon('music')}</span>
      <span class="voice-dur">${secs ? secs + '″' : '语音'}</span>
      <span class="voice-text${hasText ? '' : ' empty'}" data-voice="${m.localId}" data-ct="${Math.round(m.timeMs / 1000)}" data-sid="${esc(m.serverId || '')}">${hasText ? esc(m.transcript) : '点击转文字'}</span>
    </div>`
  } else {
    body = m.label ? `<span class="msg-tag">${esc(m.label)}</span>${m.text ? ' ' + esc(m.text) : ''}` : esc(m.text)
  }
  return sep + `<div class="msg${m.isMine ? ' mine' : ''}">
      ${avatarHtml(m.isMine ? '' : m.sender, who, 'msg-avatar')}
      <div class="msg-body">
        <div class="msg-head">
          ${S.chat.current?.isGroup && !m.isMine ? `<span class="msg-sender">${esc(who)}</span>` : ''}
          <span>${esc(fmtTime(m.timeMs))}</span>
        </div>
        <div class="bubble${m.imageMd5 ? ' bubble-image' : ''}">${body || '<span class="msg-tag">[空]</span>'}</div>
      </div>
    </div>`
}

function mergeRecalled(messages, recalled, enabled) {
  if (!enabled || !recalled?.length) return messages
  const known = new Set(messages.map((m) => m.localId))
  const extra = recalled.filter((r) => !known.has(r.localId))
  if (!extra.length) return messages
  return [...messages, ...extra].sort((a, b) => (a.sortSeq || 0) - (b.sortSeq || 0))
}

function renderMessageStream(messages) {
  const box = $('#messages')
  let prev = null
  box.innerHTML = messages.length
    ? messages.map((m) => { const h = messageHtml(m, prev); prev = m.timeMs; return h }).join('')
    : '<div class="empty">没有消息</div>'
  box.scrollTop = box.scrollHeight
  bindImages(box)
}

function bindImages(scope) {
  $$('.msg-image', scope).forEach((img) => img.addEventListener('click', () => openLightbox(img.dataset.full)))
  $$('.voice-text[data-voice]', scope).forEach((el) => el.addEventListener('click', () => transcribeOne(el)))
}

async function transcribeOne(el) {
  if (el.dataset.busy === '1') return
  const localId = el.dataset.voice
  const session = S.chat.current?.username
  if (!session) return
  el.dataset.busy = '1'
  const old = el.textContent
  el.textContent = '转写中…'
  try {
    const r = await api('/api/voice', { username: session, localId, createTime: el.dataset.ct, serverId: el.dataset.sid })
    if (r.ok) {
      el.textContent = r.text || '（无语音内容）'
      el.classList.remove('empty')
      toast(r.cached ? '已显示缓存的转写' : `转写完成 ${r.elapsedMs}ms`)
    } else {
      el.textContent = '转写失败：' + (r.error || '未知错误')
      el.classList.add('empty')
    }
  } catch (e) {
    el.textContent = '转写失败：' + e.message
    el.classList.add('empty')
  } finally {
    el.dataset.busy = '0'
    if (!el.textContent || el.textContent === old) el.textContent = old
  }
}

function openLightbox(src) {
  const box = document.createElement('div')
  box.className = 'lightbox'
  box.innerHTML = `<img src="${src}" alt="" />`
  box.addEventListener('click', () => box.remove())
  document.body.appendChild(box)
}

async function openSession(username) {
  const s = S.sessions.find((x) => x.username === username) || { username, name: username, isGroup: username.endsWith('@chatroom') }
  S.chat.current = s
  renderSessionList()
  $('#chat-title').textContent = s.name
  $('#chat-sub').textContent = s.username
  $('#messages').innerHTML = loadingHtml('读取消息…')
  try {
    const res = await api('/api/messages', { username, limit: 60 })
    S.chat.hasMore = res.hasMore
    S.chat.oldest = res.messages[0]?.sortSeq ?? null
    S.chat.recalled = res.recalled || []
    $('#perf').textContent = `${res.ms} ms`
    const voiceCount = res.messages.filter((m) => m.type === 34).length
    const transcribed = res.messages.filter((m) => m.transcript).length
    const recalledNote = S.chat.recalled.length ? ` · 已归档撤回 ${S.chat.recalled.length} 条` : ''
    const voiceNote = voiceCount ? ` · 语音 ${voiceCount} 条（已转写 ${transcribed}）` : ''
    $('#chat-status').textContent = res.dbFile ? `${res.table} · ${res.messages.length} 条${voiceNote}${recalledNote}` : '没有找到该会话的消息表'
    $('#load-earlier').disabled = !res.hasMore
    $('#transcribe-all').disabled = voiceCount === 0
    renderMessageStream(mergeRecalled(res.messages, S.chat.recalled, S.chat.showRecalled))
  } catch (e) {
    $('#messages').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`
  }
}

async function loadEarlier() {
  if (!S.chat.current || S.chat.loading || !S.chat.hasMore) return
  S.chat.loading = true
  $('#load-earlier').disabled = true
  try {
    const res = await api('/api/messages', { username: S.chat.current.username, limit: 60, before: S.chat.oldest })
    S.chat.hasMore = res.hasMore
    if (res.messages.length) S.chat.oldest = res.messages[0].sortSeq
    const box = $('#messages')
    const keep = box.scrollHeight - box.scrollTop
    let prev = null
    const html = res.messages.map((m) => { const h = messageHtml(m, prev); prev = m.timeMs; return h }).join('')
    box.insertAdjacentHTML('afterbegin', html)
    box.scrollTop = box.scrollHeight - keep
    bindImages(box)
    $('#load-earlier').disabled = !res.hasMore
    $('#perf').textContent = `${res.ms} ms`
  } catch (e) {
    $('#chat-status').textContent = '加载失败：' + e.message
  } finally {
    S.chat.loading = false
  }
}

/* ================= 朋友圈 ================= */
async function pageMoments(el) {
  el.classList.add('narrow')
  await ensureSessions()
  el.innerHTML = `
    <div class="split">
      <div class="split-side filter-side">
        <div class="pad">
          <div class="filter-block">
            <div class="filter-title">${icon('search')}关键词搜索</div>
            <input class="input w-full" id="mom-kw" placeholder="搜索动态内容" value="${esc(S.mom.keyword)}" />
          </div>
          <div class="filter-block">
            <div class="filter-title">${icon('calendar')}时间范围</div>
            <div class="row"><input class="input" type="date" id="mom-from" value="${esc(S.mom.from)}" /><span class="muted">—</span><input class="input" type="date" id="mom-to" value="${esc(S.mom.to)}" /></div>
          </div>
          <div class="filter-block">
            <div class="filter-title">${icon('users')}联系人</div>
            <input class="input w-full" id="mom-contact-search" placeholder="搜索好友…" />
            <div class="contact-mini-list" id="mom-contacts"></div>
          </div>
          <button class="btn w-full" id="mom-reset">${icon('refresh')}重置所有筛选</button>
        </div>
      </div>
      <div class="split-main">
        <div class="chat-head">
          <div><div class="chat-title">朋友圈</div><div class="chat-sub" id="mom-sub">加载中…</div></div>
          <span class="perf" id="mom-perf"></span>
        </div>
        <div class="scroll-y pad" id="mom-list"></div>
      </div>
    </div>`

  renderContactList()
  $('#mom-kw').addEventListener('input', (e) => { S.mom.keyword = e.target.value; renderMoments() })
  $('#mom-from').addEventListener('change', (e) => { S.mom.from = e.target.value; renderMoments() })
  $('#mom-to').addEventListener('change', (e) => { S.mom.to = e.target.value; renderMoments() })
  $('#mom-contact-search').addEventListener('input', renderContactList)
  $('#mom-reset').addEventListener('click', () => {
    S.mom = { keyword: '', from: '', to: '', contact: '', offset: 0, items: [] }
    pageMoments(el)
  })
  await loadMoments()
}

function renderContactList() {
  const box = $('#mom-contacts')
  if (!box) return
  const q = ($('#mom-contact-search')?.value || '').toLowerCase()
  const list = S.sessions.filter((s) => !s.isGroup).filter((s) => !q || (s.name + s.username).toLowerCase().includes(q)).slice(0, 60)
  box.innerHTML =
    `<div class="contact-mini${S.mom.contact === '' ? ' active' : ''}" data-u="">全部联系人</div>` +
    list.map((s) => `<div class="contact-mini${S.mom.contact === s.username ? ' active' : ''}" data-u="${esc(s.username)}">
      ${avatarHtml(s.username, s.name, 'avatar-xs')}<span>${esc(s.name)}</span></div>`).join('')
  $$('.contact-mini', box).forEach((n) =>
    n.addEventListener('click', () => {
      S.mom.contact = n.dataset.u
      renderContactList()
      renderMoments()
    })
  )
}

async function loadMoments() {
  const box = $('#mom-list')
  box.innerHTML = loadingHtml('读取朋友圈…')
  try {
    const data = await api('/api/moments', { limit: 200, offset: 0 })
    S.mom.items = data.moments
    $('#mom-sub').textContent = `共 ${fmtInt(data.total)} 条 · 已载入 ${data.moments.length} 条`
    $('#mom-perf').textContent = `${data.ms} ms`
    renderMoments()
  } catch (e) {
    box.innerHTML = `<div class="empty">读取失败：${esc(e.message)}</div>`
  }
}

function renderMoments() {
  const box = $('#mom-list')
  const kw = S.mom.keyword.trim().toLowerCase()
  const fromTs = S.mom.from ? new Date(S.mom.from + 'T00:00:00').getTime() : 0
  const toTs = S.mom.to ? new Date(S.mom.to + 'T23:59:59').getTime() : Infinity
  const items = S.mom.items.filter((m) => {
    if (S.mom.contact && m.username !== S.mom.contact) return false
    if (m.timeMs < fromTs || m.timeMs > toTs) return false
    if (kw) {
      const hay = (m.contentDesc + ' ' + m.authorName + ' ' + m.title).toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
  if (!items.length) {
    box.innerHTML = '<div class="empty">没有匹配的动态</div>'
    return
  }
  box.innerHTML = items.map(momentCard).join('')
}

function momentCard(m) {
  const media = m.media.length
    ? `<div class="moment-media">${m.media.slice(0, 9).map((x) => `<span class="media-chip">${x.type === 2 ? '🎬' : '🖼'} ${x.width ? x.width + '×' + x.height : ''}</span>`).join('')}${m.media.length > 9 ? `<span class="media-chip">+${m.media.length - 9}</span>` : ''}</div>`
    : ''
  const likes = m.likeNames.length ? `<div class="moment-likes">♥ ${m.likeNames.map(esc).join('、')}</div>` : ''
  const comments = m.comments.length ? `<div class="moment-comment">${m.comments.map((c) => `<div><b>${esc(c.nickname || c.username)}</b>：${esc(c.content)}</div>`).join('')}</div>` : ''
  return `<div class="moment">
    ${avatarHtml(m.username, m.authorName)}
    <div class="moment-body">
      <div class="moment-head"><span class="moment-name">${esc(m.authorName)}</span><span class="moment-time">${esc(fmtTime(m.timeMs))}</span></div>
      ${m.contentDesc ? `<div class="moment-text">${esc(m.contentDesc)}</div>` : ''}
      ${m.title ? `<div class="moment-text" style="color:var(--text-2)">🔗 ${esc(m.title)}</div>` : ''}
      ${media}${likes}${comments}
    </div>
  </div>`
}

/* ================= 分析（私聊 / 群聊） ================= */
async function pageAnalytics(el, kind) {
  const isGroup = kind === 'group'
  el.innerHTML = loadingHtml()
  await ensureSessions()
  const list = S.sessions.filter((s) => (isGroup ? s.isGroup : !s.isGroup))
  // 深链接：#/p2p/<username> 或 #/group/<username>
  const deep = (location.hash || '').match(/^#\/(?:p2p|group)\/(.+)$/)
  if (deep && !S.pick[kind]) {
    const u = decodeURIComponent(deep[1])
    S.pick[kind] = list.find((x) => x.username === u) || { username: u, name: u, isGroup: isGroup, timeMs: 0 }
  }
  const selected = S.pick[kind]

  if (!selected) {
    el.innerHTML = `<div class="card picker-card">
      <div class="card-title">${icon(isGroup ? 'users' : 'chart')}${isGroup ? '选择要分析的群聊' : '选择要分析的私聊'}</div>
      <input class="input w-full" id="pick-search" placeholder="搜索…" style="margin-bottom:10px" />
      <div class="picker-list" id="pick-list">${list.map(pickRow).join('') || '<div class="empty">没有可分析的会话</div>'}</div>
    </div>`
    const bind = () => $$('.picker-row', el).forEach((r) => r.addEventListener('click', () => {
      S.pick[kind] = list.find((x) => x.username === r.dataset.u)
      pageAnalytics(el, kind)
    }))
    bind()
    $('#pick-search').addEventListener('input', (e) => {
      const kw = e.target.value.toLowerCase()
      $('#pick-list').innerHTML = list.filter((s) => (s.name + s.username).toLowerCase().includes(kw)).map(pickRow).join('')
      bind()
    })
    return
  }

  el.innerHTML = loadingHtml(`分析 ${esc(selected.name)} …`)
  const d = await api('/api/analytics/session', { username: selected.username })
  if (!d.ok) { el.innerHTML = `<div class="card">分析失败：${esc(d.error)}</div>`; return }

  const typeItems = d.byType.slice(0, 6).map((x, i) => ({ label: x.name, value: x.count, color: PALETTE[i % PALETTE.length] }))
  const ratioItems = [
    { label: '发送', value: d.sent ?? 0, color: '#3a68d8' },
    { label: '接收', value: d.received ?? 0, color: '#22a06b' },
  ]
  const maxHour = Math.max(...d.byHour, 1)
  const maxMonth = Math.max(...d.byMonth.map((x) => x.count), 1)
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const maxWeek = Math.max(...d.byWeekday, 1)

  el.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      ${avatarHtml(selected.username, d.displayName)}
      <div><div style="font-weight:700;font-size:16px">${esc(d.displayName)}</div>
      <div class="muted" style="font-size:12px">${esc(selected.username)} · ${isGroup ? '群聊' : '私聊'}</div></div>
      <span class="spacer"></span>
      <button class="btn" id="switch-target">${icon('refresh')}换一个</button>
      <span class="perf">${d.ms} ms</span>
    </div>

    <div class="stat-grid">
      <div class="stat stat-ico"><span class="stat-ic">${icon('chat')}</span><div><div class="stat-value">${fmtInt(d.total)}</div><div class="stat-label">总消息数</div></div></div>
      <div class="stat stat-ico"><span class="stat-ic">${icon('download')}</span><div><div class="stat-value">${fmtInt(d.sent ?? 0)}</div><div class="stat-label">发送消息</div></div></div>
      <div class="stat stat-ico"><span class="stat-ic">${icon('report')}</span><div><div class="stat-value">${fmtInt(d.received ?? 0)}</div><div class="stat-label">接收消息</div></div></div>
      <div class="stat stat-ico"><span class="stat-ic">${icon('calendar')}</span><div><div class="stat-value">${fmtInt(d.days)}</div><div class="stat-label">活跃天数</div></div></div>
    </div>

    <div class="info-bar">${icon('calendar')}数据范围：${esc(fmtDate(d.firstMs))} — ${esc(fmtDate(d.lastMs))} · 日均 ${d.perDay} 条 · 峰值时段 ${d.peakHour}:00${
      d.voiceCount ? ` · 语音 ${fmtInt(d.voiceCount)} 条（已转写 ${fmtInt(d.voiceTranscribed || 0)}）` : ''
    }</div>

    <div class="grid2" style="margin-bottom:14px">
      <div class="card"><div class="card-title">${icon('chart')}消息类型分布</div>${donut(typeItems)}</div>
      <div class="card"><div class="card-title">${icon('users')}发送 / 接收比例</div>${donut(ratioItems)}</div>
    </div>

    <div class="grid2" style="margin-bottom:14px">
      <div class="card"><div class="card-title">${icon('chart')}24 小时分布</div>
        <div class="bars">${d.byHour.map((v) => `<div class="bar"><span style="height:${(v / maxHour) * 100}%"></span></div>`).join('')}</div>
        <div class="bar-labels">${d.byHour.map((_, i) => `<div>${i % 6 === 0 ? i : ''}</div>`).join('')}</div>
      </div>
      <div class="card"><div class="card-title">${icon('users')}星期分布</div>
        ${d.byWeekday.map((v, i) => `<div class="hbar"><span class="muted">${weekNames[i]}</span><span class="hbar-track"><span class="hbar-fill" style="width:${(v / maxWeek) * 100}%"></span></span><span class="hbar-val">${fmtInt(v)}</span></div>`).join('')}
      </div>
    </div>

    <div class="grid2">
      <div class="card"><div class="card-title">${icon('chat')}${isGroup ? '发言排行' : '消息分布'}</div>
        ${d.topSenders.slice(0, 10).map((x) => `<div class="hbar"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span><span class="hbar-track"><span class="hbar-fill" style="width:${(x.count / (d.topSenders[0]?.count || 1)) * 100}%"></span></span><span class="hbar-val">${fmtInt(x.count)}</span></div>`).join('')}
      </div>
      <div class="card"><div class="card-title">${icon('chart')}月度趋势</div>
        <div class="bars">${d.byMonth.map((x) => `<div class="bar" title="${esc(x.month)}: ${x.count}"><span style="height:${(x.count / maxMonth) * 100}%"></span></div>`).join('')}</div>
        <div class="bar-labels">${d.byMonth.map((x) => `<div style="font-size:9px">${x.month.slice(2)}</div>`).join('')}</div>
      </div>
    </div>`
  $('#switch-target').addEventListener('click', () => { S.pick[kind] = null; pageAnalytics(el, kind) })
}

const pickRow = (s) => `<div class="picker-row" data-u="${esc(s.username)}">
  ${avatarHtml(s.username, s.name)}
  <div style="min-width:0"><div style="font-weight:600;font-size:13px">${esc(s.name)}</div>
  <div class="muted" style="font-size:11.5px">${esc(s.username)}</div></div>
  <span class="spacer"></span><span class="muted" style="font-size:11.5px">${esc(fmtTime(s.timeMs))}</span></div>`

/* ================= 年度报告 ================= */
async function pageAnnual(el) {
  el.innerHTML = loadingHtml()
  const meta = await ensureSessions().then(() => api('/api/meta'))
  const years = [2026, 2025, 2024, 2023, 2022, 2021]
  const year = S.pick.annualYear

  if (!year) {
    el.innerHTML = `
      <div class="annual-hero">
        <div class="annual-ico">${icon('sparkle')}</div>
        <div class="annual-title">年度报告</div>
        <div class="muted">选择年份，生成你的微信聊天年度回顾</div>
        <div class="year-grid">
          ${years.map((y, i) => `<button class="year-card${i === 0 ? ' current' : ''}" data-y="${y}">
            <span class="year-num">${y}</span><span class="year-label">年</span></button>`).join('')}
        </div>
        <button class="btn primary big" id="gen-annual">${icon('sparkle')}生成 ${years[0]} 年度报告</button>
      </div>`
    let picked = years[0]
    $$('.year-card', el).forEach((b) =>
      b.addEventListener('click', () => {
        picked = Number(b.dataset.y)
        $$('.year-card', el).forEach((x) => x.classList.toggle('current', x === b))
        $('#gen-annual').innerHTML = `${icon('sparkle')}生成 ${picked} 年度报告`
      })
    )
    $('#gen-annual').addEventListener('click', () => { S.pick.annualYear = picked; pageAnnual(el) })
    return
  }

  const d = await api('/api/annual', { year })
  const maxMonth = Math.max(...d.byMonth, 1)
  const maxHour = Math.max(...d.byHour, 1)
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  el.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <div class="card-title" style="margin:0">${icon('report')}${year} 年度报告</div>
      <span class="spacer"></span>
      <button class="btn" id="annual-back">${icon('refresh')}换一年</button>
      <span class="perf">${d.ms} ms · 扫描 ${d.scannedSessions} 个会话</span>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">全年消息</div><div class="stat-value">${fmtInt(d.total)}</div><div class="stat-sub">活跃会话 ${d.activeSessions}</div></div>
      <div class="stat"><div class="stat-label">文本</div><div class="stat-value">${fmtInt(d.textCount)}</div><div class="stat-sub">${d.total ? ((d.textCount / d.total) * 100).toFixed(0) : 0}%</div></div>
      <div class="stat"><div class="stat-label">图片</div><div class="stat-value">${fmtInt(d.imageCount)}</div><div class="stat-sub">语音 ${fmtInt(d.voiceCount)}</div></div>
      <div class="stat"><div class="stat-label">最活跃月份</div><div class="stat-value">${d.peakMonth}月</div><div class="stat-sub">峰值时段 ${d.peakHour}:00</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">${icon('chart')}逐月消息量</div>
      <div class="bars" style="height:150px">${d.byMonth.map((v, i) => `<div class="bar" title="${monthNames[i]}: ${v}"><span style="height:${(v / maxMonth) * 100}%"></span></div>`).join('')}</div>
      <div class="bar-labels">${monthNames.map((m) => `<div>${m}</div>`).join('')}</div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">${icon('report')}时段热度</div>
      <div class="heat">${d.byHour.map((v, i) => `<div class="heat-cell" title="${i}:00 · ${v} 条" style="background:rgba(168,140,100,${(0.08 + (v / maxHour) * 0.85).toFixed(2)})"></div>`).join('')}</div>
      <div class="row" style="margin-top:8px;justify-content:space-between">
        <span class="muted" style="font-size:11px">0:00</span><span class="muted" style="font-size:11px">6:00</span>
        <span class="muted" style="font-size:11px">12:00</span><span class="muted" style="font-size:11px">18:00</span>
        <span class="muted" style="font-size:11px">23:00</span>
      </div>
    </div>
    <div class="grid3">
      <div class="card"><div class="card-title">${icon('chat')}最常聊的人</div>
        ${d.topPeople.map((x, i) => `<div class="row" style="padding:6px 0"><span class="muted">${i + 1}</span><span style="font-weight:600;font-size:13px">${esc(x.name)}</span><span class="spacer"></span><span class="muted">${fmtInt(x.count)}</span></div>`).join('') || '<div class="muted">—</div>'}
      </div>
      <div class="card"><div class="card-title">${icon('users')}最活跃的群</div>
        ${d.topGroups.map((x, i) => `<div class="row" style="padding:6px 0"><span class="muted">${i + 1}</span><span style="font-weight:600;font-size:13px">${esc(x.name)}</span><span class="spacer"></span><span class="muted">${fmtInt(x.count)}</span></div>`).join('') || '<div class="muted">—</div>'}
      </div>
      <div class="card"><div class="card-title">${icon('report')}会话总排行</div>
        ${d.topChats.slice(0, 6).map((x, i) => `<div class="row" style="padding:6px 0"><span class="muted">${i + 1}</span><span style="font-weight:600;font-size:13px">${esc(x.name)}</span>${x.isGroup ? '<span class="badge">群</span>' : ''}<span class="spacer"></span><span class="muted">${fmtInt(x.count)}</span></div>`).join('')}
      </div>
    </div>`
  $('#annual-back').addEventListener('click', () => { S.pick.annualYear = null; pageAnnual(el) })
}

/* ================= 导出 ================= */
async function pageExport(el) {
  el.classList.add('narrow')
  await ensureSessions()
  const fmtCards = [
    { id: 'json', name: 'JSON', desc: '完整结构化数据，便于二次处理', ok: true },
    { id: 'txt', name: 'TXT', desc: '纯文本，通用格式', ok: true },
    { id: 'html', name: 'HTML', desc: '网页格式，可直接浏览器打开', ok: true },
    { id: 'jsonl', name: 'JSONL', desc: '逐行 JSON，适合大数据导入', ok: false },
    { id: 'excel', name: 'Excel', desc: '电子表格，适合统计分析', ok: false },
    { id: 'postgres', name: 'PostgreSQL', desc: '数据库脚本，便于入库查询', ok: false },
  ]
  let fmt = 'json'

  el.innerHTML = `
    <div class="split">
      <div class="split-side">
        <div class="pad">
          <div class="row" style="margin-bottom:10px">
            <div class="side-title">${icon('chat')}选择会话</div><span class="spacer"></span>
            <button class="btn btn-xs" id="exp-refresh">${icon('refresh')}</button>
          </div>
          <input class="input w-full" id="exp-search" placeholder="搜索联系人或群组…" style="margin-bottom:8px" />
          <div class="tabs mini" id="exp-filter">
            <button data-f="all" class="tab active">全部</button>
            <button data-f="group" class="tab">群聊</button>
            <button data-f="private" class="tab">私聊</button>
          </div>
          <div class="row" style="margin:6px 0 8px">
            <button class="btn btn-xs" id="exp-all">全选</button>
            <button class="btn btn-xs" id="exp-none">清空</button>
            <span class="spacer"></span><span class="muted" style="font-size:11.5px" id="exp-count">已选 0 个</span>
          </div>
        </div>
        <div class="scroll-y" id="exp-list"></div>
      </div>
      <div class="split-main">
        <div class="scroll-y pad">
          <div class="side-title" style="margin-bottom:12px">${icon('download')}导出设置</div>
          <div class="filter-title">导出格式</div>
          <div class="fmt-grid" id="fmt-grid">
            ${fmtCards.map((c) => `<button class="fmt-card${c.id === fmt ? ' active' : ''}${c.ok ? '' : ' disabled'}" data-f="${c.id}">
              <span class="fmt-name">${c.name}${c.ok ? '' : '<span class="chip plain tiny">即将支持</span>'}</span>
              <span class="fmt-desc">${c.desc}</span></button>`).join('')}
          </div>

          <div class="filter-title" style="margin-top:18px">时间范围</div>
          <div class="row"><input class="input" type="date" id="exp-from" value="${esc(S.exp.from)}" /><span class="muted">—</span>
            <input class="input" type="date" id="exp-to" value="${esc(S.exp.to)}" /><span class="muted" style="font-size:12px">不选则导出全部</span></div>

          <div class="filter-title" style="margin-top:18px">导出选项</div>
          <div class="opt-row">
            <label class="opt"><input type="checkbox" checked disabled /> 导出头像</label>
            <label class="opt"><input type="checkbox" /> 导出图片（本地缓存）</label>
            <label class="opt"><input type="checkbox" /> 导出视频</label>
            <label class="opt"><input type="checkbox" /> 导出表情包</label>
            <label class="opt"><input type="checkbox" /> 导出语音</label>
            <label class="opt"><input type="checkbox" checked disabled /> 含已撤回（归档）</label>
          </div>

          <button class="btn primary big w-full" id="exp-go" style="margin-top:20px" disabled>${icon('download')}开始导出</button>
        </div>
      </div>
    </div>`

  const renderList = () => {
    const q = ($('#exp-search')?.value || '').toLowerCase()
    const f = S.exp.filter
    const items = S.sessions
      .filter((s) => (f === 'all' ? true : f === 'group' ? s.isGroup : !s.isGroup))
      .filter((s) => !q || (s.name + s.username).toLowerCase().includes(q))
      .slice(0, 300)
    $('#exp-list').innerHTML = items.map((s) => `<div class="picker-row" data-u="${esc(s.username)}">
        <label class="chk"><input type="checkbox" data-pick="${esc(s.username)}" ${S.exp.selected.has(s.username) ? 'checked' : ''} /></label>
        ${avatarHtml(s.username, s.name)}
        <div style="min-width:0"><div style="font-weight:600;font-size:13px">${esc(s.name)}</div>
        <div class="muted" style="font-size:11px">${esc(s.username)}</div></div>
        <span class="spacer"></span>${s.isGroup ? '<span class="badge">群</span>' : ''}
      </div>`).join('')
    $$('[data-pick]', el).forEach((cb) =>
      cb.addEventListener('change', () => {
        if (cb.checked) S.exp.selected.add(cb.dataset.pick)
        else S.exp.selected.delete(cb.dataset.pick)
        updateCount()
      })
    )
    $$('.picker-row', el).forEach((r) =>
      r.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'INPUT') return
        const cb = $('[data-pick]', r)
        if (!cb) return
        cb.checked = !cb.checked
        cb.dispatchEvent(new Event('change'))
      })
    )
  }
  const updateCount = () => {
    $('#exp-count').textContent = `已选 ${S.exp.selected.size} 个`
    $('#exp-go').disabled = S.exp.selected.size === 0
  }

  $$('#fmt-grid .fmt-card').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.classList.contains('disabled')) return toast('这个格式还在开发中')
      fmt = b.dataset.f
      $$('#fmt-grid .fmt-card').forEach((x) => x.classList.toggle('active', x === b))
    })
  )
  $$('#exp-filter .tab').forEach((t) =>
    t.addEventListener('click', () => {
      S.exp.filter = t.dataset.f
      $$('#exp-filter .tab').forEach((x) => x.classList.toggle('active', x === t))
      renderList()
    })
  )
  $('#exp-search').addEventListener('input', renderList)
  $('#exp-all').addEventListener('click', () => {
    S.sessions.filter((s) => (S.exp.filter === 'all' ? true : S.exp.filter === 'group' ? s.isGroup : !s.isGroup)).forEach((s) => S.exp.selected.add(s.username))
    renderList(); updateCount()
  })
  $('#exp-none').addEventListener('click', () => { S.exp.selected.clear(); renderList(); updateCount() })
  $('#exp-refresh').addEventListener('click', async () => { await ensureSessions(true); renderList(); toast('会话已刷新') })
  $('#exp-from').addEventListener('change', (e) => (S.exp.from = e.target.value))
  $('#exp-to').addEventListener('change', (e) => (S.exp.to = e.target.value))
  $('#exp-go').addEventListener('click', () => {
    const names = [...S.exp.selected]
    if (!names.length) return
    toast(`开始导出 ${names.length} 个会话…`)
    names.forEach((u, i) => {
      setTimeout(() => {
        const link = document.createElement('a')
        const params = new URLSearchParams({ username: u, format: fmt, limit: '100000' })
        if (S.exp.from) params.set('from', S.exp.from)
        if (S.exp.to) params.set('to', S.exp.to)
        if (S.account) params.set('account', S.account)
        link.href = `/api/export?${params.toString()}`
        document.body.appendChild(link)
        link.click()
        link.remove()
      }, i * 400)
    })
  })
  renderList()
  updateCount()
}

/* ================= 数据管理 ================= */
async function pageData(el) {
  el.innerHTML = loadingHtml()
  const d = await api('/api/data')
  el.innerHTML = `
    <div class="row" style="margin-bottom:14px"><div class="card-title" style="margin:0">${icon('database')}数据管理</div>
      <span class="spacer"></span><span class="perf">${d.ms} ms</span></div>

    <div class="stat-grid">
      <div class="stat"><div class="stat-label">源数据库</div><div class="stat-value">${d.dbs.length}</div><div class="stat-sub">${fmtSize(d.totalSourceBytes)}</div></div>
      <div class="stat"><div class="stat-label">解密缓存</div><div class="stat-value">${fmtSize(d.cacheBytes)}</div><div class="stat-sub">${d.cacheFiles} 个文件</div></div>
      <div class="stat"><div class="stat-label">图片缓存</div><div class="stat-value">${fmtSize(d.media?.bytes || 0)}</div><div class="stat-sub">${d.media?.files || 0} 张已解密</div></div>
      <div class="stat"><div class="stat-label">防撤回归档</div><div class="stat-value">${fmtInt(d.archive?.recalled || 0)}</div><div class="stat-sub">共观察 ${fmtInt(d.archive?.total || 0)} 条</div></div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">${icon('settings')}账号与密钥</div>
      ${d.accounts.map((a) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
        ${avatarHtml(a.wxid, a.wxid)}
        <div><div style="font-weight:600;font-size:13px">${esc(a.wxid)}</div><div class="muted" style="font-size:11.5px">${esc(a.dbPath)}</div></div>
        <span class="spacer"></span><span class="chip plain">key ${esc(a.keyMask)}</span>
        ${a.wxid === d.account.wxid ? '<span class="chip">当前</span>' : `<button class="btn" data-switch="${esc(a.wxid)}">切换</button>`}
      </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-title">${icon('database')}数据库清单</div>
      <table class="table">
        <thead><tr><th>文件</th><th>目录</th><th class="num">大小</th><th class="num">WAL</th><th>更新</th></tr></thead>
        <tbody>${d.dbs.slice(0, 26).map((x) => `<tr><td>${esc(x.name)}</td><td class="muted">${esc(x.group)}</td>
          <td class="num">${fmtSize(x.sizeBytes)}</td><td class="num">${x.walBytes ? fmtSize(x.walBytes) : '—'}</td>
          <td class="muted">${esc(fmtTime(x.mtimeMs))}</td></tr>`).join('')}</tbody>
      </table>
      <div class="muted" style="font-size:12px;margin-top:10px">
        数据目录：${esc(d.dbStorage)}<br/>缓存目录：${esc(d.cacheRoot || '-')}<br/>防撤回归档：${esc(d.archive?.path || '-')}（纯旁路，不改微信数据库）<br/>
        WXGF 转码：${d.ffmpeg ? esc(d.ffmpeg) : '未找到 ffmpeg'}
      </div>
    </div>`
  $$('[data-switch]', el).forEach((b) =>
    b.addEventListener('click', () => {
      S.account = b.dataset.switch
      localStorage.setItem('weka.account', S.account)
      S.sessions = []
      S.chat = { current: null, oldest: null, hasMore: false, loading: false, recalled: [], showRecalled: S.chat.showRecalled }
      S.pick = { p2p: null, group: null, annualYear: null }
      S.exp.selected.clear()
      toast('已切换账号')
      route(location.hash)
    })
  )
}

/* ================= 设置 ================= */
async function pageSettings(el) {
  const meta = await api('/api/meta')
  const deepTab = (location.hash || '').match(/^#\/settings\/([a-z]+)$/)
  if (deepTab) S.setTab = deepTab[1]
  const tabs = [
    ['appearance', '外观'],
    ['security', '数据解密'],
    ['voice', '语音转文字'],
    ['storage', '数据管理'],
    ['about', '关于'],
  ]
  const body = {
    appearance: () => `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">${icon('settings')}外观</div>
        <div class="row" style="padding:8px 0"><span>主题</span><span class="spacer"></span>
          <select class="input" id="theme-select">
            <option value="light"${S.theme === 'light' ? ' selected' : ''}>浅色（奶油）</option>
            <option value="dark"${S.theme === 'dark' ? ' selected' : ''}>深色</option>
          </select></div>
        <div class="row" style="padding:8px 0"><span>侧栏</span><span class="spacer"></span>
          <button class="btn" id="toggle-collapse">展开 / 收起</button></div>
      </div>`,
    security: () => `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">${icon('database')}数据库解密</div>
        <div class="row" style="padding:7px 0"><span class="muted">当前账号</span><span class="spacer"></span><span>${esc(meta.account.wxid)}</span></div>
        <div class="row" style="padding:7px 0"><span class="muted">微信数据目录</span><span class="spacer"></span><span>${esc(meta.account.dbPath)}</span></div>
        <div class="row" style="padding:7px 0"><span class="muted">数据库密钥来源</span><span class="spacer"></span><span>${esc(meta.account.source === 'weflow' ? '从 WeFlow 配置导入' : meta.account.source || '配置')}</span></div>
        <div class="row" style="padding:7px 0"><span class="muted">聊天图片密钥</span><span class="spacer"></span>
          <span>${meta.imageKeys ? '<span class="chip">已配置</span>' : '<span class="chip gold">未配置</span>'}</span></div>
        <div class="row" style="padding:7px 0"><span class="muted">WXGF 图片转码（ffmpeg）</span><span class="spacer"></span>
          <span>${meta.ffmpeg ? '<span class="chip">就绪</span>' : '<span class="chip gold">未找到</span>'}</span></div>
        <div class="tips" style="margin-top:8px">
          <div class="tip">解密算法：PBKDF2-SHA512(256000) + AES-256-CBC，逐页解密微信 4.0 的 SQLCipher 数据库</div>
          <div class="tip">图片：AES-128-ECB + XOR 段解密 DAT，WXGF(HEVC) 用 ffmpeg 转码</div>
        </div>
      </div>`,
    voice: () => `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">${icon('music')}语音转文字（本地离线）</div>
        <div id="voice-status">${loadingHtml('检查模型…')}</div>
      </div>
      <div class="card">
        <div class="card-title">${icon('report')}支持语言</div>
        <div class="lang-grid">
          ${[['中文', 'CHINESE'], ['英语', 'ENGLISH'], ['日语', 'JAPANESE'], ['韩语', 'KOREAN'], ['粤语', 'CANTONESE']]
            .map(([zh, en]) => `<div class="lang-card"><span class="lang-zh">${zh}</span><span class="lang-en">${en}</span></div>`)
            .join('')}
        </div>
        <div class="tips" style="margin-top:14px">
          <div class="tip">SenseVoice 模型自动识别中/英/日/韩/粤，无需手动切换</div>
          <div class="tip">转写结果会缓存到本机，参与「聊天搜索」</div>
          <div class="tip">聊天页顶部搜索框可直接搜语音转写内容</div>
        </div>
      </div>`,
    storage: () => `
      <div class="card">
        <div class="card-title">${icon('database')}存储</div>
        <div class="tips">
          <div class="tip">解密库缓存：${fmtSize(meta.cache?.bytes || 0)}（${meta.cache?.files || 0} 个文件）</div>
          <div class="tip">会话数：${meta.sessionCount}</div>
          <div class="tip">缓存按 (mtime,size) 指纹失效，微信写库后会自动重新解密</div>
        </div>
      </div>`,
    about: () => `
      <div class="card">
        <div class="card-title">${icon('report')}关于 weka</div>
        <div class="tips">
          <div class="tip">weka ${esc(meta.version)} · 纯本地解析，零外部依赖，不发起任何上传</div>
          <div class="tip">功能：聊天浏览 / 朋友圈 / 私聊分析 / 群聊分析 / 年度报告 / 导出 / 数据管理 / 防撤回 / 图片解密</div>
          <div class="tip">数据来自你自己的微信客户端，请勿用于未经授权的用途</div>
        </div>
      </div>`,
  }

  el.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <div class="card-title" style="margin:0">${icon('settings')}设置</div>
      <span class="spacer"></span>
      <button class="btn" id="test-conn">${icon('refresh')}测试连接</button>
    </div>
    <div class="tabs" id="set-tabs">
      ${tabs.map(([id, label]) => `<button class="tab${S.setTab === id ? ' active' : ''}" data-t="${id}">${label}</button>`).join('')}
    </div>
    <div id="set-body">${body[S.setTab]()}</div>`

  const bindBody = () => {
    $('#theme-select')?.addEventListener('change', (e) => {
      S.theme = e.target.value
      localStorage.setItem('weka.theme', S.theme)
      document.documentElement.dataset.mode = S.theme
    })
    $('#toggle-collapse')?.addEventListener('click', toggleCollapse)
    // 语音页：拉取真实模型状态
    if (S.setTab === 'voice') loadVoiceStatus()
  }

  async function loadVoiceStatus() {
    const box = $('#voice-status')
    if (!box) return
    try {
      const st = await api('/api/voice/status')
      const m = st.model
      box.innerHTML = `
        <div class="row" style="padding:7px 0">
          <span class="chip ${m.ready ? '' : 'gold'}">${m.ready ? '✓ 模型已就绪' : '模型未下载'}</span>
          <span class="spacer"></span>
          <span class="muted" style="font-size:12px">${m.ready ? (m.modelBytes / 1048576).toFixed(0) + ' MB' : ''}</span>
        </div>
        <div class="row" style="padding:7px 0"><span class="muted">模型目录</span><span class="spacer"></span>
          <span style="font-size:12px;word-break:break-all;text-align:right">${esc(m.dir)}</span></div>
        <div class="row" style="padding:7px 0"><span class="muted">已转写语音</span><span class="spacer"></span>
          <span>${fmtInt(st.transcripts.count)} 条</span></div>
        <div class="row" style="padding:7px 0"><span class="muted">推理引擎</span><span class="spacer"></span>
          <span style="font-size:12px">sherpa-onnx + SenseVoice int8（CPU）</span></div>
        ${m.ready ? '' : `<div class="info-bar gold" style="margin-top:12px">${icon('report')}把 model.int8.onnx 与 tokens.txt 放进上面的目录即可启用</div>`}
      `
    } catch (e) {
      box.innerHTML = `<div class="muted">读取失败：${esc(e.message)}</div>`
    }
  }
  bindBody()
  $$('#set-tabs .tab').forEach((t) =>
    t.addEventListener('click', () => {
      S.setTab = t.dataset.t
      $$('#set-tabs .tab').forEach((x) => x.classList.toggle('active', x === t))
      $('#set-body').innerHTML = body[S.setTab]()
      bindBody()
    })
  )
  $('#test-conn').addEventListener('click', async () => {
    try {
      const m = await api('/api/meta')
      toast(`连接正常 · ${m.sessionCount} 个会话`)
    } catch (e) {
      toast('连接失败：' + e.message)
    }
  })
}

/* ================= 路由 ================= */
const ROUTES = {
  home: { title: '首页', render: pageHome },
  chat: { title: '聊天', render: pageChat },
  moments: { title: '朋友圈', render: pageMoments },
  p2p: { title: '私聊分析', render: (el) => pageAnalytics(el, 'p2p') },
  group: { title: '群聊分析', render: (el) => pageAnalytics(el, 'group') },
  annual: { title: '年度报告', render: pageAnnual },
  export: { title: '导出数据', render: pageExport },
  data: { title: '数据管理', render: pageData },
  settings: { title: '设置', render: pageSettings },
}

async function route(hash) {
  const name = (hash || '').replace(/^#\/?/, '').split('/')[0] || 'home'
  const def = ROUTES[name] || ROUTES.home
  S.route = ROUTES[name] ? name : 'home'
  $('#page-title').textContent = def.title
  $$('.nav-item[data-route]').forEach((n) => n.classList.toggle('active', n.dataset.route === S.route))
  const el = $('#content')
  el.className = 'content'
  const page = document.createElement('div')
  page.className = 'page'
  el.innerHTML = ''
  el.appendChild(page)
  try {
    await def.render(page)
  } catch (e) {
    page.innerHTML = `<div class="card">出错了：${esc(e.message)}</div>`
  }
}

function toggleCollapse() {
  $('#app').classList.toggle('collapsed')
  localStorage.setItem('weka.collapsed', $('#app').classList.contains('collapsed') ? '1' : '0')
}

async function boot() {
  document.documentElement.dataset.mode = S.theme
  $$('.nav-icon[data-icon]').forEach((n) => (n.innerHTML = icon(n.dataset.icon)))
  if (localStorage.getItem('weka.collapsed') === '1') $('#app').classList.add('collapsed')
  $('#collapse-btn').addEventListener('click', toggleCollapse)
  try {
    const meta = await api('/api/meta')
    S.meta = meta
    S.myName = meta.myName || meta.myWxid
    $('#topbar-user').textContent = S.myName
    const img = $('#topbar-avatar')
    img.src = `/api/avatar?username=${encodeURIComponent(meta.myWxid)}${S.account ? `&account=${encodeURIComponent(S.account)}` : ''}`
    img.onerror = () => img.remove()
  } catch {
    $('#topbar-user').textContent = '未连接'
    $('#conn-dot').style.background = '#d95757'
  }
  window.addEventListener('hashchange', () => route(location.hash))
  await route(location.hash || '#/home')
}

boot()


