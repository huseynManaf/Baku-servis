document.addEventListener('DOMContentLoaded', () => {
  const serviceSelect = document.getElementById('service_name');
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

  function populateServices(services) {
    if (!serviceSelect) return;
    serviceSelect.innerHTML = '<option value="">Seçin</option>' + (services || []).map((service) => (
      `<option value="${service.name}">${service.name}</option>`
    )).join('');
  }

  async function loadServices() {
    try {
      const response = await fetch('/api/services');
      const services = await response.json();
      populateServices(services || []);
    } catch (error) {
      console.error('loadServices error:', error);
    }
  }

  requestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      customer_name: document.getElementById('customer_name').value.trim(),
      customer_phone: document.getElementById('customer_phone').value.trim(),
      service_name: serviceSelect.value,
      device_info: document.getElementById('device_info').value.trim()
    };

    if (!payload.customer_name || !payload.customer_phone || !payload.service_name) {
      requestMessage.textContent = 'Ad, telefon və xidmət sahələrini doldurun.';
      requestMessage.style.color = '#ffb0b0';
      return;
    }

    const response = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    if (!response.ok) {
      requestMessage.textContent = body.error || 'Müraciət göndərilmədi.';
      requestMessage.style.color = '#ffb0b0';
      return;
    }

    requestForm.reset();
    requestMessage.textContent = `Müraciət yarandı. İzləmə kodu: ${body.tracking_code} · ${body.created_at}`;
    requestMessage.style.color = '#9fe7ba';
  });

  trackForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const trackingCode = document.getElementById('tracking_code').value.trim();
    if (!trackingCode) {
      return;
    }

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
    resultCreated.textContent = formatDate(request.created_at);
    resultUpdated.textContent = formatDate(request.updated_at);
    resultQuoted.textContent = Number(request.quoted_price || 0).toFixed(2) + ' ₼';
    resultFinal.textContent = Number(request.final_price || 0).toFixed(2) + ' ₼';
    trackingResult.style.display = 'block';
  });

  loadServices();
});
