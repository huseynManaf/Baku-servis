document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const adminView = document.getElementById('admin-view');
  const loginForm = document.getElementById('login-form');
  const loginMessage = document.getElementById('login-message');
  const adminUser = document.getElementById('admin-user');
  const requestsTable = document.getElementById('requests-table');
  const servicesTable = document.getElementById('services-table');
  const requestsView = document.getElementById('requests-view');
  const servicesView = document.getElementById('services-view');
  const chatsView = document.getElementById('chats-view');
  const detailView = document.getElementById('detail-view');
  const serviceModal = document.getElementById('service-modal');
  const statTotal = document.getElementById('stat-total');
  const statPending = document.getElementById('stat-pending');
  const statInWork = document.getElementById('stat-inwork');
  const statReady = document.getElementById('stat-ready');
  const adminChatList = document.getElementById('admin-chat-list');
  const adminChatMessages = document.getElementById('admin-chat-messages');
  const adminChatInput = document.getElementById('admin-chat-input');
  const adminChatSend = document.getElementById('admin-chat-send');
  const adminRoleBadge = document.getElementById('admin-role-badge');
  const usersView = document.getElementById('users-view');
  const createAdminCard = document.getElementById('create-admin-card');
  const createAdminForm = document.getElementById('create-admin-form');
  const usersTable = document.getElementById('users-table');

  let selectedRequestId = null;
  let currentChatSession = null;
  let currentUserRole = 'ADMIN';

  function statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('gözləm') || value.includes('pending')) return 'status-yeni';
    if (value.includes('qiym') || value.includes('quote')) return 'status-qiymetlendirildi';
    if (value.includes('hazır')) return 'status-hazir';
    if (value.includes('icra')) return 'status-icrada';
    if (value.includes('təhvil') || value.includes('teslim')) return 'status-teslim';
    return 'status-baxilir';
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatPrice(value) {
    const number = Number(value || 0);
    return `${number.toFixed(2)} ₼`;
  }

  function showView(target) {
    if (requestsView) requestsView.style.display = target === 'requests' ? 'block' : 'none';
    if (servicesView) servicesView.style.display = target === 'services' ? 'block' : 'none';
    if (chatsView) chatsView.style.display = target === 'chats' ? 'block' : 'none';
    if (detailView) detailView.style.display = target === 'detail' ? 'block' : 'none';
    if (usersView) usersView.style.display = target === 'users' ? 'block' : 'none';

    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === target);
    });
  }

  function updateStats(requests) {
    if (!Array.isArray(requests)) return;
    const count = requests.length;
    const pending = requests.filter((request) => String(request.status || '').includes('Gözləmədə')).length;
    const inwork = requests.filter((request) => String(request.status || '').includes('İcrada')).length;
    const ready = requests.filter((request) => String(request.status || '').includes('Hazırdır')).length;

    if (statTotal) statTotal.textContent = String(count);
    if (statPending) statPending.textContent = String(pending);
    if (statInWork) statInWork.textContent = String(inwork);
    if (statReady) statReady.textContent = String(ready);
  }

  async function checkAuth() {
    try {
      const response = await fetch('/api/admin/me');
      const data = await response.json();

      if (data.loggedIn) {
        currentUserRole = data.role || 'ADMIN';
        const isSuperAdmin = Boolean(data.isSuperAdmin || currentUserRole === 'SUPER_ADMIN');
        document.querySelectorAll('.super-admin-only').forEach((item) => {
          item.style.display = isSuperAdmin ? 'block' : 'none';
        });
        if (createAdminCard) createAdminCard.style.display = isSuperAdmin ? 'block' : 'none';
        if (adminRoleBadge) {
          adminRoleBadge.textContent = isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN';
          adminRoleBadge.className = `status-badge ${isSuperAdmin ? 'status-hazir' : 'status-qiymetlendirildi'}`;
        }
        if (loginView) loginView.style.display = 'none';
        if (adminView) adminView.style.display = 'grid';
        if (adminUser) adminUser.textContent = `İstifadəçi: ${data.username}`;
        showView('requests');
        await loadRequests();
        await loadServices();
        await loadAdminChats();
        if (isSuperAdmin) await loadUsers();
      } else {
        if (loginView) loginView.style.display = 'flex';
        if (adminView) adminView.style.display = 'none';
      }
    } catch (error) {
      console.error('checkAuth error:', error);
    }
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value
    };

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) {
        if (loginMessage) {
          loginMessage.textContent = body.error || 'Giriş alınmadı.';
          loginMessage.style.color = '#ffb0b0';
        }
        return;
      }

      if (loginMessage) {
        loginMessage.textContent = '';
      }
      await checkAuth();
    } catch (error) {
      console.error('login error:', error);
      if (loginMessage) {
        loginMessage.textContent = 'Server ilə əlaqə qurula bilmədi.';
        loginMessage.style.color = '#ffb0b0';
      }
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    await checkAuth();
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', async (event) => {
      event.preventDefault();
      const view = item.dataset.view;
      showView(view);
      if (view === 'requests') await loadRequests();
      if (view === 'services') await loadServices();
      if (view === 'chats') await loadAdminChats();
    });
  });

  function redirectToAdminLogin() {
    const currentPath = window.location.pathname;
    const fallbackUrl = currentPath === '/admin' ? '/admin' : '/admin';
    if (window.location.pathname !== '/admin') {
      window.location.href = '/admin';
      return;
    }
    window.location.href = fallbackUrl;
  }

  async function loadRequests() {
    try {
      const response = await fetch('/api/admin/requests');

      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(`Admin requests request failed: ${response.status}`);
      }

      const data = await response.json();
      const requests = Array.isArray(data) ? data : (Array.isArray(data.requests) ? data.requests : []);
      updateStats(requests);

      if (!requestsTable) return;
      requestsTable.innerHTML = requests.map((request) => `
        <tr data-id="${request.id}" style="cursor:pointer;">
          <td>${request.tracking_code}</td>
          <td>${request.customer_name}</td>
          <td>${request.customer_phone}</td>
          <td>${request.service_name}</td>
          <td>${formatDateTime(request.created_at)}</td>
          <td><span class="status-badge ${statusClass(request.status)}">${request.status}</span></td>
          <td><span class="status-badge ${request.payment_status === 'Ödənilib' ? 'status-hazir' : 'status-yeni'}">${request.payment_status || 'Ödənilməyib'}</span></td>
          <td>${Number(request.final_price || request.quoted_price || 0).toFixed(2)} ₼</td>
        </tr>
      `).join('');

      requestsTable.querySelectorAll('tr[data-id]').forEach((row) => {
        row.addEventListener('click', () => openRequestDetail(Number(row.dataset.id)));
      });
    } catch (error) {
      console.error('loadRequests error:', error);
    }
  }

  async function openRequestDetail(id) {
    selectedRequestId = id;

    try {
      const response = await fetch(`/api/admin/requests/${id}`);
      const body = await response.json();
      const request = body.request;

      document.getElementById('detail-code').value = request.tracking_code;
      document.getElementById('detail-name').value = request.customer_name;
      document.getElementById('detail-phone').value = request.customer_phone;
      document.getElementById('detail-device').value = request.device_info || '-';
      document.getElementById('detail-service').value = request.service_name || '-';
      document.getElementById('detail-created').value = formatDateTime(request.created_at);
      document.getElementById('detail-status').value = request.status || 'Gözləmədə';
      document.getElementById('detail-quoted').value = Number(request.quoted_price || 0);
      document.getElementById('detail-final').value = Number(request.final_price || 0);
      document.getElementById('detail-payment-status').value = request.payment_status || 'Ödənilməyib';

      const detailOnsiteBox = document.getElementById('detail-onsite-box');
      const detailAddress = document.getElementById('detail-address');
      const detailMapLink = document.getElementById('detail-map-link');
      const isOnsite = Boolean(request.is_onsite);

      if (isOnsite && (request.address || request.latitude != null || request.longitude != null)) {
        detailOnsiteBox.style.display = 'block';
        detailAddress.value = request.address || `${request.latitude}, ${request.longitude}`;
        if (request.latitude != null && request.longitude != null) {
          detailMapLink.href = `https://www.google.com/maps?q=${request.latitude},${request.longitude}`;
          detailMapLink.style.display = 'inline-flex';
        } else {
          detailMapLink.style.display = 'none';
        }
      } else {
        detailOnsiteBox.style.display = 'none';
      }

      showView('detail');
    } catch (error) {
      console.error('openRequestDetail error:', error);
    }
  }

  document.getElementById('save-request-btn')?.addEventListener('click', async () => {
    if (!selectedRequestId) return;

    const payload = {
      status: document.getElementById('detail-status').value,
      quoted_price: document.getElementById('detail-quoted').value,
      final_price: document.getElementById('detail-final').value,
      payment_status: document.getElementById('detail-payment-status').value
    };

    try {
      const response = await fetch(`/api/admin/requests/${selectedRequestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) {
        alert(body.error || 'Yeniləmə uğursuz oldu.');
        return;
      }

      await loadRequests();
      await openRequestDetail(selectedRequestId);
      alert('Müraciət yeniləndi.');
    } catch (error) {
      console.error('saveRequest error:', error);
      alert('Müraciət yenilənə bilmədi.');
    }
  });

  document.getElementById('back-to-list-btn')?.addEventListener('click', async () => {
    showView('requests');
    await loadRequests();
  });

  function openServiceModal(service = null) {
    const serviceNameInput = document.getElementById('service-name');
    const serviceCategoryInput = document.getElementById('service-category');
    const servicePriceInput = document.getElementById('service-price');
    const serviceSubmitBtn = document.getElementById('service-submit-btn');
    const serviceIdHidden = document.getElementById('service-id');

    if (!serviceModal) return;

    if (service) {
      serviceNameInput.value = service.name || '';
      serviceCategoryInput.value = service.category || '';
      servicePriceInput.value = Number(service.price || 0);
      serviceSubmitBtn.textContent = 'Yadda saxla';
      if (!serviceIdHidden) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = 'service-id';
        document.getElementById('service-form').appendChild(hidden);
      }
      document.getElementById('service-id').value = String(service.id);
    } else {
      document.getElementById('service-form').reset();
      if (serviceIdHidden) serviceIdHidden.remove();
      serviceSubmitBtn.textContent = 'Əlavə et';
    }

    serviceModal.classList.add('open');
    serviceModal.setAttribute('aria-hidden', 'false');
  }

  function closeServiceModal() {
    if (!serviceModal) return;
    serviceModal.classList.remove('open');
    serviceModal.setAttribute('aria-hidden', 'true');
    const serviceForm = document.getElementById('service-form');
    if (serviceForm) serviceForm.reset();
    const serviceIdHidden = document.getElementById('service-id');
    if (serviceIdHidden) serviceIdHidden.remove();
  }

  async function loadServices() {
    try {
      const response = await fetch('/api/admin/services', { headers: { 'Content-Type': 'application/json' } });

      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(`Admin services request failed: ${response.status}`);
      }

      const data = await response.json();
      const services = Array.isArray(data) ? data : (Array.isArray(data.services) ? data.services : []);

      if (!servicesTable) return;
      servicesTable.innerHTML = services.map((service) => `
        <tr>
          <td>${service.name}</td>
          <td>${service.category}</td>
          <td>${formatPrice(service.price)}</td>
          <td>${formatDateTime(service.created_at)}</td>
          <td>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-outline btn-sm" data-edit-service="${service.id}">Redaktə</button>
              <button class="btn btn-danger btn-sm" data-delete-service="${service.id}">Sil</button>
            </div>
          </td>
        </tr>
      `).join('');

      servicesTable.querySelectorAll('[data-edit-service]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = Number(button.dataset.editService);
          const service = services.find((item) => Number(item.id) === id);
          if (service) openServiceModal(service);
        });
      });

      servicesTable.querySelectorAll('[data-delete-service]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = Number(button.dataset.deleteService);
          await fetch(`/api/admin/services/${id}`, { method: 'DELETE' });
          await loadServices();
        });
      });
    } catch (error) {
      console.error('loadServices error:', error);
    }
  }

  async function loadUsers() {
    try {
      const response = await fetch('/api/admin/users');
      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok) throw new Error(`Admin users request failed: ${response.status}`);
      const data = await response.json();
      const users = Array.isArray(data.users) ? data.users : [];
      if (!usersTable) return;
      usersTable.innerHTML = users.map((user) => `
        <tr>
          <td>${user.email || user.username || '-'}</td>
          <td>${user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</td>
          <td>${formatDateTime(user.created_at)}</td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('loadUsers error:', error);
    }
  }

  async function loadAdminChats() {
    try {
      const response = await fetch('/api/admin/chats');

      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(`Admin chats request failed: ${response.status}`);
      }

      const data = await response.json();
      const chats = Array.isArray(data.chats) ? data.chats : [];

      if (!adminChatList) return;
      adminChatList.innerHTML = chats.length ? chats.map((chat) => `
        <div class="admin-chat-item ${currentChatSession === chat.session_id ? 'active' : ''}" data-session-id="${chat.session_id}">
          <strong>${chat.customer_name}</strong>
          <div>${chat.last_message || 'Mesaj yoxdur'}</div>
          <small>${chat.unread_count ? `${chat.unread_count} oxunmamış` : 'Oxunmuş'} · ${formatDateTime(chat.last_message_at)}</small>
        </div>
      `).join('') : '<div class="small">Aktiv chat yoxdur.</div>';

      adminChatList.querySelectorAll('.admin-chat-item').forEach((item) => {
        item.addEventListener('click', async () => {
          const sessionId = item.dataset.sessionId;
          currentChatSession = sessionId;
          await openChat(sessionId);
          await loadAdminChats();
        });
      });

      if (!currentChatSession && chats.length) {
        currentChatSession = chats[0].session_id;
        await openChat(currentChatSession);
      }
    } catch (error) {
      console.error('loadAdminChats error:', error);
    }
  }

  async function openChat(sessionId) {
    if (!sessionId) return;
    currentChatSession = sessionId;
    try {
      const response = await fetch(`/api/chat/history/${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      const messages = data.messages || [];

      if (!adminChatMessages) return;
      adminChatMessages.innerHTML = messages.map((msg) => {
        const sender = String(msg.sender_type || 'customer');
        const isBot = sender === 'bot';
        const isCustomer = sender === 'customer';
        const label = isBot ? '🤖 Baku AI Bot' : isCustomer ? '🧑 Müşteri' : '👨‍💼 Baku Team';
        const className = isBot ? 'bot' : isCustomer ? 'customer' : 'admin';

        return `
          <div class="bubble ${className}">
            <span class="chat-badge">${label}</span>
            <div class="chat-message">${msg.message}</div>
          </div>
        `;
      }).join('');
      adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    } catch (error) {
      console.error('openChat error:', error);
    }
  }

  adminChatSend?.addEventListener('click', async () => {
    if (!currentChatSession) return;
    const message = (adminChatInput?.value || '').trim();
    if (!message) return;
    if (adminChatInput) adminChatInput.value = '';

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentChatSession, sender_type: 'admin', message })
      });
      await openChat(currentChatSession);
      await loadAdminChats();
    } catch (error) {
      console.error('admin chat send error:', error);
    }
  });

  adminChatInput?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      adminChatSend?.click();
    }
  });

  createAdminForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('new-admin-email').value.trim();
    const password = document.getElementById('new-admin-password').value;
    const messageEl = document.getElementById('create-admin-message');

    try {
      const response = await fetch('/api/admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await response.json();
      if (!response.ok) {
        if (messageEl) {
          messageEl.textContent = body.error || 'Admin yaradıla bilmədi.';
          messageEl.style.color = '#ffb0b0';
        }
        return;
      }
      if (messageEl) {
        messageEl.textContent = 'Yeni admin uğurla yaradıldı.';
        messageEl.style.color = '#8ce7b2';
      }
      createAdminForm.reset();
      await loadUsers();
    } catch (error) {
      console.error('createAdmin error:', error);
      if (messageEl) {
        messageEl.textContent = 'Yeni admin yaradılarkən xəta baş verdi.';
        messageEl.style.color = '#ffb0b0';
      }
    }
  });

  document.getElementById('add-service-btn')?.addEventListener('click', () => openServiceModal());

  document.getElementById('close-service-modal')?.addEventListener('click', closeServiceModal);

  serviceModal?.addEventListener('click', (event) => {
    if (event.target === serviceModal) closeServiceModal();
  });

  document.getElementById('service-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('service-id');
    const payload = {
      name: document.getElementById('service-name').value.trim(),
      category: document.getElementById('service-category').value.trim() || 'Genel',
      price: Number(document.getElementById('service-price').value || 0)
    };

    if (!payload.name) return;

    try {
      const response = await fetch(id ? `/api/admin/services/${id.value}` : '/api/admin/services', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) {
        alert(body.error || 'Xidmət yadda saxlanıla bilmədi.');
        return;
      }

      closeServiceModal();
      await loadServices();
    } catch (error) {
      console.error('saveService error:', error);
      alert('Xidmət yadda saxlanıla bilmədi.');
    }
  });

  setInterval(async () => {
    if (document.getElementById('admin-view') && document.getElementById('admin-view').style.display !== 'none') {
      await loadRequests();
      if (chatsView && chatsView.style.display !== 'none') {
        await loadAdminChats();
      }
    }
  }, 5000);

  checkAuth();
});
