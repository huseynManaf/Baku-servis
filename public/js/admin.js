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
  const detailView = document.getElementById('detail-view');
  const serviceModal = document.getElementById('service-modal');

  let selectedRequestId = null;

  function showView(target) {
    requestsView.style.display = target === 'requests' ? 'block' : 'none';
    servicesView.style.display = target === 'services' ? 'block' : 'none';
    detailView.style.display = target === 'detail' ? 'block' : 'none';

    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === target);
    });
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function checkAuth() {
    const response = await fetch('/api/admin/me');
    const data = await response.json();

    if (data.loggedIn) {
      loginView.style.display = 'none';
      adminView.style.display = 'grid';
      adminUser.textContent = `İstifadəçi: ${data.username}`;
      showView('requests');
      loadRequests();
      loadServices();
    } else {
      loginView.style.display = 'grid';
      adminView.style.display = 'none';
    }
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value
    };

    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    if (!response.ok) {
      loginMessage.textContent = body.error || 'Giriş alınmadı.';
      loginMessage.style.color = '#ffb0b0';
      return;
    }

    loginMessage.textContent = '';
    await checkAuth();
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    await checkAuth();
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const view = item.dataset.view;
      showView(view);
      if (view === 'requests') loadRequests();
      if (view === 'services') loadServices();
    });
  });

  async function loadRequests() {
    const response = await fetch('/api/admin/requests');
    const requests = await response.json();

    requestsTable.innerHTML = (requests || []).map((request) => `
      <tr data-id="${request.id}" style="cursor:pointer;">
        <td>${request.tracking_code}</td>
        <td>${request.customer_name}</td>
        <td>${request.customer_phone}</td>
        <td>${request.service_name}</td>
        <td>${formatDateTime(request.created_at)}</td>
        <td><span class="status-badge">${request.status}</span></td>
        <td>${Number(request.final_price || request.quoted_price || 0).toFixed(2)} ₼</td>
      </tr>
    `).join('');

    requestsTable.querySelectorAll('tr[data-id]').forEach((row) => {
      row.addEventListener('click', () => openRequestDetail(Number(row.dataset.id)));
    });
  }

  async function openRequestDetail(id) {
    selectedRequestId = id;
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

    showView('detail');
  }

  document.getElementById('save-request-btn')?.addEventListener('click', async () => {
    if (!selectedRequestId) return;

    const payload = {
      status: document.getElementById('detail-status').value,
      quoted_price: document.getElementById('detail-quoted').value,
      final_price: document.getElementById('detail-final').value
    };

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
    alert('Müraciət yeniləndi.');
  });

  document.getElementById('back-to-list-btn')?.addEventListener('click', () => {
    showView('requests');
    loadRequests();
  });

  async function loadServices() {
    const response = await fetch('/api/admin/services', { headers: { 'Content-Type': 'application/json' } });
    const services = await response.json();
    servicesTable.innerHTML = (services || []).map((service) => `
      <tr>
        <td>${service.name}</td>
        <td>${service.category}</td>
        <td>${formatDateTime(service.created_at)}</td>
        <td><button class="danger" data-delete-service="${service.id}">Sil</button></td>
      </tr>
    `).join('');

    servicesTable.querySelectorAll('[data-delete-service]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.deleteService);
        await fetch(`/api/admin/services/${id}`, { method: 'DELETE' });
        await loadServices();
      });
    });
  }

  document.getElementById('add-service-btn')?.addEventListener('click', () => {
    serviceModal.style.display = 'grid';
  });

  document.getElementById('close-service-modal')?.addEventListener('click', () => {
    serviceModal.style.display = 'none';
  });

  document.getElementById('service-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById('service-name').value.trim(),
      category: document.getElementById('service-category').value.trim() || 'Genel'
    };

    if (!payload.name) {
      return;
    }

    const response = await fetch('/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    if (!response.ok) {
      alert(body.error || 'Xidmət əlavə edilə bilmədi.');
      return;
    }

    serviceModal.style.display = 'none';
    document.getElementById('service-form').reset();
    await loadServices();
  });

  checkAuth();
});
