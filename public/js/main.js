// public/js/main.js
// Initialize after DOM is ready so elements placed after the script are available
document.addEventListener('DOMContentLoaded', function () {
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Xidmətləri yüklə ----------
  let servicesCache = [];
  async function loadServices() {
    const { ok, status, body } = await doFetch('/api/services');
    servicesCache = body || [];

    const grid = el('#services-grid');
    grid.innerHTML = servicesCache.map(s => `
      <div class="svc-card">
        <span class="svc-cat">${escapeHtml(s.category)}</span>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description || '')}</p>
        <div class="svc-price-row">
          ${s.discount_price
            ? `<span class="svc-price">${s.discount_price} ₼</span><span class="svc-price-old">${s.price} ₼</span>`
            : `<span class="svc-price">${s.price} ₼</span>`}
        </div>
        <a href="#muraciet" class="btn btn-outline btn-sm svc-pick" data-service-id="${s.id}">Bu xidmətə müraciət et</a>
      </div>
    `).join('');

    const select = el('#service-select');
    select.innerHTML = '<option value="">Seçin (məcburi deyil)</option>' +
      servicesCache.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

    els('.svc-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        select.value = btn.dataset.serviceId;
      });
    });
  }

  // Poll services version and refresh when it changes
  let lastServicesVersion = null;
  // Robust fetch helper that logs and returns parsed JSON body
  async function doFetch(url, opts = {}) {
    console.log('[doFetch] ->', url, opts && opts.method ? opts.method : 'GET');
    try {
      const r = await fetch(url, opts);
      let body = {};
      try { body = await r.json(); } catch (e) { body = {}; }
      console.log('[doFetch] <-', url, r.status, body);
      return { ok: r.ok, status: r.status, res: r, body };
    } catch (err) {
      console.error('[doFetch] error', url, err);
      showToast('error', 'Şəbəkə xətası — bağlantınızı yoxlayın');
      throw err;
    }
  }
  async function pollServicesVersion() {
    try {
      const { ok, status, body: j } = await doFetch('/api/services/version');
      if (lastServicesVersion === null) lastServicesVersion = j.version;
      if (j.version && j.version !== lastServicesVersion) {
        lastServicesVersion = j.version;
        await loadServices();
      }
    } catch (e) { /* ignore */ }
  }
  setInterval(pollServicesVersion, 5000);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Toast notifications ----------
  function showToast(type, message, timeout = 4000) {
    try {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const t = document.createElement('div');
      t.className = 'toast ' + (type === 'error' ? 'toast-err' : 'toast-ok');
      t.textContent = message;
      container.appendChild(t);
      setTimeout(() => t.classList.add('visible'), 20);
      setTimeout(() => {
        t.classList.remove('visible');
        setTimeout(() => t.remove(), 300);
      }, timeout);
    } catch (e) { console.error('showToast error', e); }
  }

  function setButtonLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset.orig = btn.innerHTML;
      btn.classList.add('loading');
      btn.innerHTML = (text || btn.textContent) + ' <span class="spinner" aria-hidden="true"></span>';
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig;
      btn.disabled = false;
      delete btn.dataset.orig;
    }
  }

  // ---------- Auth UI (login / register) ----------
  const authModal = el('#auth-modal');
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-modal-title');
  const authUsername = document.getElementById('auth-username');
  const authPassword = document.getElementById('auth-password');
  const authPhoneField = document.getElementById('auth-phone-field');
  const authPhone = document.getElementById('auth-phone');
  const authMsg = document.getElementById('auth-msg');
  let authMode = 'login'; // or 'register'

  function openAuth(mode) {
    authMode = mode;
    authTitle.textContent = mode === 'register' ? 'Qeydiyyat' : 'Daxil ol';
    authPhoneField.style.display = mode === 'register' ? 'block' : 'none';
    authForm.querySelector('button[type=submit]').textContent = mode === 'register' ? 'Qeydiyyat' : 'Daxil ol';
    authMsg.style.display = 'none'; authMsg.textContent = '';
    authUsername.value = '';
    authPassword.value = '';
    authPhone.value = '';
    authModal.classList.add('open');
  }
  // expose a global helper so inline onclick handlers can reliably open the modal
  window.openAuthModal = openAuth;
  window.closeAuth = closeAuth;
  function closeAuth() { authModal.classList.remove('open'); }
  const authModalCloseBtn = document.getElementById('auth-modal-close');
  if (authModalCloseBtn) authModalCloseBtn.addEventListener('click', closeAuth);
  if (authModal) authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuth(); });

  async function checkAuth() {
    try {
      const { ok, status, body: j } = await doFetch('/api/me', { credentials: 'same-origin' });
      const loginBtn = el('#login-btn');
      const registerBtn = el('#register-btn');
      const accountBtn = el('#account-btn');
      // Update UI per-element so pages missing one control still work
      if (j.loggedIn) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (accountBtn) {
          accountBtn.style.display = 'inline-flex';
          accountBtn.textContent = 'Hesabım (' + (j.username || '') + ')';
          accountBtn.onclick = (e) => { e && e.preventDefault && e.preventDefault(); openAccount(); };
        }
      } else {
        if (loginBtn) {
          loginBtn.style.display = 'inline-flex';
          loginBtn.onclick = (e) => { e && e.preventDefault && e.preventDefault(); openAuth('login'); };
        }
        if (registerBtn) {
          registerBtn.style.display = 'inline-flex';
          registerBtn.onclick = (e) => { e && e.preventDefault && e.preventDefault(); openAuth('register'); };
        }
        if (accountBtn) accountBtn.style.display = 'none';
      }
    } catch (e) { console.error('checkAuth error', e); }
  }

  // ---------- Account / user requests ----------
  function openAccount() {
    const acc = el('#account-section');
    if (!acc) return;
    acc.style.display = 'block';
    acc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadUserRequests();
  }

  async function loadUserRequests() {
    const container = el('#account-requests');
    if (!container) return;
    container.innerHTML = '<div class="hint">Yüklənir...</div>';
    try {
      const { ok, status, body: rows } = await doFetch('/api/user/requests', { credentials: 'same-origin' });
      if (!ok) {
        container.innerHTML = '<div class="hint">Müraciətlər yüklənə bilmədi</div>';
        return;
      }
      if (!rows || !rows.length) {
        container.innerHTML = '<div class="hint">Heç bir müraciət tapılmadı</div>';
        return;
      }
      container.innerHTML = rows.map(r => `
        <div class="ticket" style="margin-bottom:10px;">
          <div>
            <div class="tname">${escapeHtml(r.service_name || r.device_info || ('#' + (r.tracking_code || r.id)) )}</div>
            <div class="tdev">${escapeHtml(r.device_info || r.problem_description || '')}</div>
            <div class="hint">Kod: ${escapeHtml(r.tracking_code || '')} · ${new Date(r.created_at || '').toLocaleString()}</div>
          </div>
          <div style="text-align:right">
            <span class="status-chip status-${r.status}">${escapeHtml(r.status)}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error('loadUserRequests error', e);
      container.innerHTML = '<div class="hint">Xəta baş verdi</div>';
    }
  }

  // account logout button hookup
  const accountLogoutBtn = document.getElementById('account-logout');
  if (accountLogoutBtn) {
    accountLogoutBtn.addEventListener('click', async (e) => {
      e && e.preventDefault && e.preventDefault();
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
        showToast('success', 'Çıxış edildi');
        checkAuth();
        const acc = el('#account-section'); if (acc) acc.style.display = 'none';
      } catch (err) {
        showToast('error', 'Çıxış alınmadı');
      }
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      authMsg.style.display = 'none'; authMsg.textContent = '';
      const payload = { username: authUsername.value.trim(), password: authPassword.value };
      if (authMode === 'register') payload.phone = authPhone.value.trim();
      const submitBtn = authForm.querySelector('button[type=submit]');
      try {
        setButtonLoading(submitBtn, true, authForm.querySelector('button[type=submit]').textContent);
        const url = authMode === 'register' ? '/api/register' : '/api/login';
        const { ok, status, body: j } = await doFetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!ok) {
          const msg = j.error || j.details || (j.message || `Server error ${status}`);
          showToast('error', msg);
          authMsg.style.display = 'block'; authMsg.className = 'form-msg err'; authMsg.textContent = msg;
          setButtonLoading(submitBtn, false);
          return;
        }
        showToast('success', authMode === 'register' ? 'Qeydiyyat uğurlu oldu' : 'Daxil olundu');
        closeAuth();
        await checkAuth();
      } catch (err) {
        const msg = err && err.message ? err.message : 'Xəta';
        showToast('error', msg);
        authMsg.style.display = 'block'; authMsg.className = 'form-msg err'; authMsg.textContent = msg;
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });

  }

  // ---------- Xidmət forması: servis / evde toggle ----------
  const visitGroup = el('#visit-type-group');
  const addressField = el('#address-field');
  let map, marker;

  if (visitGroup) {
    visitGroup.addEventListener('click', (e) => {
      const opt = e.target.closest('.radio-opt');
      if (!opt) return;
      els('.radio-opt', visitGroup).forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      opt.querySelector('input').checked = true;
      const isHome = opt.dataset.val === 'evde';
      addressField.style.display = isHome ? 'block' : 'none';
      if (isHome) initMap();
    });
  }

  function initMap() {
    if (map) { setTimeout(() => map.invalidateSize(), 150); return; }
    map = L.map('map').setView([40.4093, 49.8671], 12); // Baki merkezi
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(map);
      el('#request-form input[name=latitude]')?.remove();
      el('#request-form input[name=longitude]')?.remove();
      const form = el('#request-form');
      const latInput = document.createElement('input');
      latInput.type = 'hidden'; latInput.name = 'latitude'; latInput.value = lat;
      const lngInput = document.createElement('input');
      lngInput.type = 'hidden'; lngInput.name = 'longitude'; lngInput.value = lng;
      form.appendChild(latInput); form.appendChild(lngInput);
    });
    setTimeout(() => map.invalidateSize(), 150);
  }

  // ---------- Müraciət forması submit ----------
  const requestFormEl = el('#request-form');
  if (requestFormEl) {
    requestFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const msgBox = el('#form-msg');
      msgBox.className = 'form-msg';
      msgBox.textContent = '';
      const submitBtn = form.querySelector('button[type=submit]');
      try {
        setButtonLoading(submitBtn, true, submitBtn.textContent);
        const { ok, status, body: data } = await doFetch('/api/requests', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!ok) {
          const detail = data.error || data.details || `Server error ${status}`;
          showToast('error', detail);
          msgBox.className = 'form-msg err';
          msgBox.textContent = detail;
          return;
        }
        msgBox.className = 'form-msg ok';
        msgBox.textContent = `Müraciətiniz qeydə alındı! İzləmə kodunuz: ${data.tracking_code}`;
        showToast('success', 'Müraciətiniz qeydə alındı');
        try { alert('Müraciət qeydə alındı. İzləmə kodu: ' + (data.tracking_code || data.id)); } catch (e) { console.log('Alert failed', e); }
        form.reset();
        addressField.style.display = 'none';
        els('.radio-opt', visitGroup).forEach(o => o.classList.remove('active'));
        el('.radio-opt[data-val="servis"]', visitGroup).classList.add('active');
      } catch (err) {
        const msg = err && err.message ? err.message : 'Xəta baş verdi';
        msgBox.className = 'form-msg err';
        msgBox.textContent = msg;
        showToast('error', msg);
        console.error('Request form submit error:', err);
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // ---------- İzləmə + Chat ----------
  let currentTrack = null; // { id, code, phone }
  let chatPollTimer = null;

  async function refreshTrackDetails() {
    if (!currentTrack) return;
    const { ok, status, body: data } = await doFetch(`/api/requests/track?code=${encodeURIComponent(currentTrack.code)}&phone=${encodeURIComponent(currentTrack.phone)}`);
    if (!ok) {
      const msg = (data && (data.error || data.details)) || `Tapılmadı (${status})`;
      showToast('error', msg);
      return;
    }
    renderTrackResult(data);
  }

  const trackFormEl = el('#track-form');
  if (trackFormEl) {
    trackFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const code = fd.get('code').trim();
      const phone = fd.get('phone').trim();
      const { ok, status, body: data } = await doFetch(`/api/requests/track?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);
      if (!ok) {
        const msg = (data && (data.error || data.details)) || `Tapılmadı (${status})`;
        showToast('error', msg);
        return;
      }
      currentTrack = { id: data.id, code, phone };
      renderTrackResult(data);
      startChatPolling();
    });
  }

  function statusLabel(s) {
    const map = {
      yeni: 'Yeni', baxilir: 'Baxılır', qiymetlendirildi: 'Qiymətləndirildi',
      icrada: 'İcrada', hazir: 'Hazırdır', teslim: 'Təhvil verilib', legv: 'Ləğv edilib'
    };
    return map[String(s || '').trim()] || String(s || 'Yeni');
  }

  function formatMessageTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('az-AZ', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  }

  function renderTrackResult(data) {
    el('#track-result').style.display = 'block';
    el('#tr-service').textContent = data.device_info || 'Müraciətiniz';
    el('#tr-device').textContent = data.problem_description || '';

    const statusValue = String(data.status || 'yeni').trim();
    const chip = el('#tr-status');
    chip.className = 'status-chip status-' + statusValue;
    chip.textContent = statusLabel(statusValue);

    const proposedPrice = data.quoted_price !== null && data.quoted_price !== undefined ? Number(data.quoted_price) : null;
    const finalPrice = data.final_price !== null && data.final_price !== undefined ? Number(data.final_price) : null;
    const price = finalPrice ?? proposedPrice;

    if (finalPrice !== null && finalPrice !== undefined && !Number.isNaN(finalPrice)) {
      el('#tr-price').textContent = `${finalPrice} ₼`;
    } else if (proposedPrice !== null && proposedPrice !== undefined && !Number.isNaN(proposedPrice)) {
      el('#tr-price').textContent = `${proposedPrice} ₼`;
    } else {
      el('#tr-price').textContent = 'Qiymət gözlənilir';
    }

    const payBtn = el('#pay-btn');
    if (price && !data.is_paid) {
      payBtn.style.display = 'inline-flex';
      payBtn.onclick = async () => {
        payBtn.disabled = true; payBtn.textContent = 'Ödəniş edilir...';
        const { ok, status, body: rd } = await doFetch(`/api/requests/${data.id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: currentTrack.code, phone: currentTrack.phone, method: 'card' }) });
        if (ok) {
          payBtn.textContent = 'Ödənildi ✓';
          data.is_paid = 1;
        } else {
          showToast('error', (rd && (rd.error || rd.details)) || `Ödəniş xətası (${status})`);
          payBtn.disabled = false; payBtn.textContent = 'Kartla ödə (demo)';
        }
      };
    } else {
      payBtn.style.display = 'none';
    }
    el('#track-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadMessages() {
    if (!currentTrack) return;
    const { ok, status, body: msgs } = await doFetch(`/api/requests/${currentTrack.id}/messages?code=${encodeURIComponent(currentTrack.code)}&phone=${encodeURIComponent(currentTrack.phone)}`);
    if (!ok) return;
    const log = el('#chat-log');
    log.innerHTML = (msgs || []).map(m => {
      const timeText = formatMessageTime(m.created_at);
      return `
        <div class="msg ${m.sender}">
          ${escapeHtml(m.body)}
          ${timeText ? `<time>${timeText}</time>` : ''}
        </div>
      `;
    }).join('');
    log.scrollTop = log.scrollHeight;
  }

  function startChatPolling() {
    loadMessages();
    refreshTrackDetails();
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(() => {
      loadMessages();
      refreshTrackDetails();
    }, 4000);
  }

  el('#chat-send').addEventListener('click', sendChat);
  el('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  async function sendChat() {
    const input = el('#chat-input');
    const body = input.value.trim();
    if (!body || !currentTrack) return;
    input.value = '';
    try {
      const { ok, status, body: jd } = await doFetch(`/api/requests/${currentTrack.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: currentTrack.code, phone: currentTrack.phone, body }) });
      if (!ok) {
        showToast('error', jd && (jd.error || jd.details) ? (jd.error || jd.details) : `Mesaj göndərilə bilmədi (${status})`);
      } else {
        showToast('success', 'Mesaj göndərildi');
      }
    } catch (e) {
      showToast('error', 'Mesaj göndərilə bilmədi');
    }
    loadMessages();
  }

  checkAuth();
  loadServices();
});
