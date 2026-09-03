document.addEventListener('DOMContentLoaded', () => {
  const serviceSelect = document.getElementById('service_name');
  const serviceCards = document.getElementById('service-cards');
  const requestForm = document.getElementById('request-form');
  const trackForm = document.getElementById('track-form');
  const requestMessage = document.getElementById('request-message');
  const trackingResult = document.getElementById('tracking-result');
  const resultService = document.getElementById('result-service');
  const resultDevice = document.getElementById('result-device');
  const resultStatus = document.getElementById('result-status');
  const resultCreated = document.getElementById('result-created');
  const resultUpdated = document.getElementById('result-updated');
  const resultQuoted = document.getElementById('result-quoted');
  const resultFinal = document.getElementById('result-final');

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function setMessage(text, type = 'error') {
    if (!requestMessage) return;
    requestMessage.textContent = text;
    requestMessage.className = `request-message form-msg ${type === 'success' ? 'ok' : 'err'}`;
    requestMessage.classList.add('show');
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('gözləm') || value.includes('pending')) return 'status-yeni';
    if (value.includes('qiym') || value.includes('quote')) return 'status-qiymetlendirildi';
    if (value.includes('hazır')) return 'status-hazir';
    if (value.includes('icra')) return 'status-icrada';
    if (value.includes('təhvil') || value.includes('teslim')) return 'status-teslim';
    return 'status-baxilir';
  }

  function populateServices(services) {
    if (!serviceSelect) return;
    serviceSelect.innerHTML = '<option value="">Seçin</option>' + (services || []).map((service) => (
      `<option value="${service.name}">${service.name}</option>`
    )).join('');
  }

  function renderServiceCards(services) {
    if (!serviceCards) return;
    if (!Array.isArray(services) || !services.length) {
      serviceCards.innerHTML = '<div class="loading-block">Hazır xidmət yoxdur.</div>';
      return;
    }

    serviceCards.innerHTML = services.map((service) => `
      <article class="svc-card">
        <div class="svc-cat">${service.category || 'Genel'}</div>
        <h3>${service.name}</h3>
        <p>Peşəkar texniki yardım, dəqiq qiymətləndirmə və sürətli status izləmə.</p>
        <div class="svc-price-row">
          <span class="svc-price">₼</span>
          <span class="svc-price-old">Qiymət</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm svc-pick" data-service-name="${service.name}">Seç</button>
      </article>
    `).join('');

    serviceCards.querySelectorAll('[data-service-name]').forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.serviceName;
        if (serviceSelect) {
          serviceSelect.value = name;
          serviceSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  }

  async function loadServices() {
    try {
      const response = await fetch('/api/services');
      const services = await response.json();
      populateServices(services || []);
      renderServiceCards(services || []);
    } catch (error) {
      console.error('loadServices error:', error);
      if (serviceCards) {
        serviceCards.innerHTML = '<div class="loading-block">Xidmətlər yüklənə bilmədi.</div>';
      }
    }
  }

  requestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      customer_name: document.getElementById('customer_name').value.trim(),
      customer_phone: document.getElementById('customer_phone').value.trim(),
      service_name: serviceSelect ? serviceSelect.value : '',
      device_info: document.getElementById('device_info').value.trim()
    };

    if (!payload.customer_name || !payload.customer_phone || !payload.service_name) {
      setMessage('Ad, telefon və xidmət sahələrini doldurun.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error || 'Müraciət göndərilmədi.', 'error');
        return;
      }

      requestForm.reset();
      setMessage(`Müraciət yarandı. İzləmə kodu: ${body.tracking_code} · ${body.created_at}`, 'success');
    } catch (error) {
      console.error('requestForm error:', error);
      setMessage('Serverə qoşularkən xəta baş verdi.', 'error');
    }
  });

  trackForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const trackingCode = document.getElementById('tracking_code').value.trim();
    if (!trackingCode) {
      return;
    }

    try {
      const response = await fetch(`/api/requests/track/${encodeURIComponent(trackingCode)}`);
      const body = await response.json();

      if (!response.ok) {
        trackingResult.style.display = 'none';
        alert(body.error || 'Müraciət tapılmadı.');
        return;
      }

      const request = body.request || {};
      resultService.textContent = request.service_name || '-';
      resultDevice.textContent = request.device_info || 'Cihaz məlumatı yoxdur';
      resultStatus.textContent = request.status || 'Gözləmədə';
      resultStatus.className = `status-chip ${statusClass(request.status)}`;
      resultCreated.textContent = formatDate(request.created_at);
      resultUpdated.textContent = formatDate(request.updated_at);
      resultQuoted.textContent = `${Number(request.quoted_price || 0).toFixed(2)} ₼`;
      resultFinal.textContent = `${Number(request.final_price || 0).toFixed(2)} ₼`;
      trackingResult.style.display = 'block';
    } catch (error) {
      console.error('trackForm error:', error);
      alert('İzləmə məlumatı alınarkən xəta baş verdi.');
    }
  });

  loadServices();
});
