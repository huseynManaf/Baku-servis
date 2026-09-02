// public/js/admin.js
(function () {
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const statusLabel = (s) => ({
    yeni: 'Yeni', baxilir: 'Baxılır', qiymetlendirildi: 'Qiymətləndirildi',
    icrada: 'İcrada', hazir: 'Hazırdır', teslim: 'Təhvil verilib', legv: 'Ləğv edilib'
  }[s] || s);

  // ---------- Auth ----------
  async function checkAuth() {
    const res = await fetch('/api/admin/me');
    const data = await res.json();
    if (data.loggedIn) {
      el('#login-view').style.display = 'none';
      el('#admin-view').style.display = 'grid';
      el('#admin-username').textContent = data.username;
      showView('dashboard');
    } else {
      el('#login-view').style.display = 'flex';
      el('#admin-view').style.display = 'none';
    }
  }

  el('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(fd.entries()))
    });
    const data = await res.json();
    const msg = el('#login-msg');
    if (!res.ok) { msg.className = 'form-msg err'; msg.textContent = data.error || data.details || JSON.stringify(data); return; }
    msg.className = 'form-msg'; msg.textContent = '';
    checkAuth();
  });

  el('#logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    checkAuth();
  });

  // ---------- Nav / views ----------
  const viewTitles = { dashboard: 'İdarə paneli', requests: 'Müraciətlər', services: 'Xidmətlər', detail: 'Müraciət detalı' };
  function showView(name) {
    ['dashboard', 'requests', 'detail', 'services'].forEach(v => {
      el('#view-' + v).style.display = v === name ? 'block' : 'none';
    });
    els('.admin-side .nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === name));
    el('#page-title').textContent = viewTitles[name];
    if (name === 'dashboard') loadDashboard();
    if (name === 'requests') loadRequests('hamisi');
    if (name === 'services') loadServices();
  }
  els('.admin-side .nav-item').forEach(a => a.addEventListener('click', () => showView(a.dataset.view)));

  // ---------- Dashboard ----------
  async function loadDashboard() {
    const stats = await (await fetch('/api/admin/stats')).json();
    el('#s-total').textContent = stats.total;
    el('#s-yeni').textContent = stats.yeni;
    el('#s-icrada').textContent = stats.icrada;
    el('#s-gelir').textContent = stats.gelir + ' ₼';

    const rows = await (await fetch('/api/admin/requests')).json();
    el('#dash-recent').innerHTML = rows.slice(0, 8).map(r => `
      <tr class="clickable" data-id="${r.id}">
        <td>${r.tracking_code}</td>
        <td>${escapeHtml(r.customer_name)}</td>
        <td>${escapeHtml(r.service_name || '-')}</td>
        <td><span class="status-chip status-${r.status}">${statusLabel(r.status)}</span></td>
        <td>${new Date(r.created_at + 'Z').toLocaleDateString('az-AZ')}</td>
      </tr>
    `).join('');
    els('#dash-recent tr').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
  }

  // ---------- Requests list ----------
  els('#status-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      els('#status-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadRequests(tab.dataset.status);
    });
  });

  async function loadRequests(status) {
    const rows = await (await fetch('/api/admin/requests?status=' + status)).json();
    el('#requests-tbody').innerHTML = rows.map(r => `
      <tr class="clickable" data-id="${r.id}">
        <td>${r.tracking_code}</td>
        <td>${escapeHtml(r.customer_name)}</td>
        <td>${escapeHtml(r.phone)}</td>
        <td>${escapeHtml(r.service_name || '-')}</td>
        <td>${r.visit_type === 'evde' ? 'Evdə' : 'Servisdə'}</td>
        <td><span class="status-chip status-${r.status}">${statusLabel(r.status)}</span></td>
        <td>${r.final_price || r.quoted_price || '-'}</td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="color:var(--text-low)">Bu statusda müraciət yoxdur</td></tr>';
    els('#requests-tbody tr[data-id]').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
  }

  // ---------- Request detail ----------
  let currentDetailId = null;
  let detailPollTimer = null;

  async function openDetail(id) {
    currentDetailId = id;
    showView('detail');
    const data = await (await fetch('/api/admin/requests/' + id)).json();
    const r = data.request;
    el('#d-code').textContent = r.tracking_code;
    el('#d-name').textContent = r.customer_name;
    el('#d-phone').textContent = r.phone;
    el('#d-device').textContent = r.device_info || '-';
    el('#d-service').textContent = r.service_name || '-';
    el('#d-visit').textContent = r.visit_type === 'evde' ? 'Evdə xidmət' : 'Servisdə';
    el('#d-address').textContent = r.address_text || (r.latitude ? `${r.latitude}, ${r.longitude}` : '-');
    el('#d-problem').textContent = r.problem_description || '';
    el('#d-status').value = r.status;
    el('#d-quoted').value = r.quoted_price || '';
    el('#d-final').value = r.final_price || '';

    el('#d-payments').innerHTML = data.payments.length
      ? data.payments.map(p => `<div class="kv"><span>${new Date(p.created_at + 'Z').toLocaleString('az-AZ')}</span><b>${p.amount} ₼ — ${p.status}</b></div>`).join('')
      : '<p style="font-size:13px;margin:0">Ödəniş yoxdur</p>';

    renderDetailChat(data.messages);
    if (detailPollTimer) clearInterval(detailPollTimer);
    detailPollTimer = setInterval(async () => {
      const fresh = await (await fetch('/api/admin/requests/' + id)).json();
      renderDetailChat(fresh.messages);
    }, 4000);
  }

  function renderDetailChat(msgs) {
    const log = el('#d-chat-log');
    log.innerHTML = msgs.map(m => `
      <div class="msg ${m.sender}">
        ${escapeHtml(m.body)}
        <time>${new Date(m.created_at + 'Z').toLocaleString('az-AZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</time>
      </div>
    `).join('');
    log.scrollTop = log.scrollHeight;
  }

  el('#back-to-list').addEventListener('click', () => { clearInterval(detailPollTimer); showView('requests'); });

  el('#d-chat-send').addEventListener('click', sendDetailChat);
  el('#d-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendDetailChat(); });
  async function sendDetailChat() {
    const input = el('#d-chat-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    await fetch(`/api/admin/requests/${currentDetailId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body })
    });
    const fresh = await (await fetch('/api/admin/requests/' + currentDetailId)).json();
    renderDetailChat(fresh.messages);
  }

  el('#d-save').addEventListener('click', async () => {
    const payload = {
      status: el('#d-status').value,
      quoted_price: el('#d-quoted').value ? parseFloat(el('#d-quoted').value) : undefined,
      final_price: el('#d-final').value ? parseFloat(el('#d-final').value) : undefined
    };
    await fetch(`/api/admin/requests/${currentDetailId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    el('#d-save').textContent = 'Saxlanıldı ✓';
    setTimeout(() => el('#d-save').textContent = 'Yadda saxla', 1500);
  });

  // ---------- Services CRUD ----------
  async function loadServices() {
    const rows = await (await fetch('/api/admin/services')).json();
    el('#services-tbody').innerHTML = rows.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.category)}</td>
        <td>${s.price} ₼</td>
        <td>${s.discount_price ? s.discount_price + ' ₼' : '-'}</td>
        <td>${s.is_active ? 'Bəli' : 'Xeyr'}</td>
        <td>
          <button class="btn-ghost edit-svc" data-id="${s.id}">Redaktə</button>
          <button class="btn-ghost del-svc" data-id="${s.id}" style="color:var(--danger)">Sil</button>
        </td>
      </tr>
    `).join('');

    els('.edit-svc').forEach(b => b.addEventListener('click', () => openServiceModal(rows.find(r => r.id == b.dataset.id))));
    els('.del-svc').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Bu xidməti silmək istədiyinizə əminsiniz?')) return;
      await fetch('/api/admin/services/' + b.dataset.id, { method: 'DELETE' });
      loadServices();
    }));
  }

  const modal = el('#service-modal');
  el('#add-service-btn').addEventListener('click', () => openServiceModal(null));
  el('#service-modal-close').addEventListener('click', () => modal.classList.remove('open'));

  function openServiceModal(svc) {
    el('#service-modal-title').textContent = svc ? 'Xidməti redaktə et' : 'Yeni xidmət';
    el('#sv-id').value = svc ? svc.id : '';
    el('#sv-name').value = svc ? svc.name : '';
    el('#sv-category').value = svc ? svc.category : '';
    el('#sv-description').value = svc ? svc.description : '';
    el('#sv-price').value = svc ? svc.price : '';
    el('#sv-discount').value = svc && svc.discount_price ? svc.discount_price : '';
    el('#sv-active').value = svc ? String(svc.is_active) : '1';
    modal.classList.add('open');
  }

  el('#service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('#sv-id').value;
    const payload = {
      name: el('#sv-name').value,
      category: el('#sv-category').value || 'umumi',
      description: el('#sv-description').value,
      price: parseFloat(el('#sv-price').value),
      discount_price: el('#sv-discount').value ? parseFloat(el('#sv-discount').value) : null,
      is_active: el('#sv-active').value === '1'
    };
    const url = id ? '/api/admin/services/' + id : '/api/admin/services';
    await fetch(url, {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    modal.classList.remove('open');
    loadServices();
  });

  checkAuth();
})();
