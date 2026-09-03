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
  const resultPaymentStatus = document.getElementById('result-payment-status');
  const resultAddressWrap = document.getElementById('result-address-wrap');
  const resultAddress = document.getElementById('result-address');
  const payButtonWrap = document.getElementById('pay-button-wrap');
  const payButton = document.getElementById('pay-button');
  const paymentModal = document.getElementById('payment-modal');
  const closePaymentModal = document.getElementById('close-payment-modal');
  const paymentForm = document.getElementById('payment-form');
  const paymentMethodSelect = document.getElementById('payment_method');
  const cardNumberInput = document.getElementById('card-number');
  const cardExpiryInput = document.getElementById('card-expiry');
  const cardCvcInput = document.getElementById('card-cvc');
  const cardBrandBadge = document.getElementById('card-brand-badge');
  const themeToggle = document.getElementById('theme-toggle');
  const resultPaymentMethod = document.getElementById('result-payment-method');
  let activeTrackingId = null;

  const onsiteToggle = document.getElementById('is_onsite');
  const onsiteMapWrap = document.getElementById('onsite-map-wrap');
  const onsiteAddressInput = document.getElementById('onsite-address');
  const onsiteLatInput = document.getElementById('onsite-latitude');
  const onsiteLngInput = document.getElementById('onsite-longitude');
  const searchAddressBtn = document.getElementById('search-address-btn');

  let onSiteMap = null;
  let onSiteMarker = null;

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

  function applyTheme(theme) {
    const root = document.body;
    const resolved = theme === 'light' ? 'theme-light' : '';
    root.classList.toggle('theme-light', resolved === 'theme-light');
    if (themeToggle) themeToggle.textContent = theme === 'light' ? 'Dark' : 'Light';
    localStorage.setItem('hugu-theme', theme);
  }

  function isWithinAzerbaijan(lat, lng) {
    return Number(lat) >= 38.3 && Number(lat) <= 41.9 && Number(lng) >= 44.7 && Number(lng) <= 50.9;
  }

  function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) {
      alert(message);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-ok' : 'toast-err'} visible`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 220);
    }, 2600);
  }

  function luhnCheck(cardNumber) {
    const digits = String(cardNumber || '').replace(/\D/g, '');
    if (!/^\d{13,19}$/.test(digits)) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = Number(digits[i]);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  function detectCardBrand(cardNumber) {
    const digits = String(cardNumber || '').replace(/\D/g, '');
    if (!digits) return { brand: 'Lokal Kart', accent: '#7dd3fc' };
    if (/^4/.test(digits)) return { brand: 'Visa', accent: '#1a73e8' };
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[0-1]))/.test(digits)) return { brand: 'Mastercard', accent: '#f59e0b' };
    return { brand: 'Lokal Kart', accent: '#34d399' };
  }

  function validatePaymentDetails() {
    const cardNumber = cardNumberInput.value.trim();
    const expiry = cardExpiryInput.value.trim();
    const cvc = cardCvcInput.value.trim();

    if (!/^\d{13,19}$/.test(cardNumber.replace(/\D/g, ''))) {
      showToast('Kart nömrəsi 13-19 rəqəm olmalıdır.');
      return false;
    }

    if (!luhnCheck(cardNumber)) {
      showToast('Kart nömrəsi etibarsızdır.');
      return false;
    }

    const expiryMatch = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry);
    if (!expiryMatch) {
      showToast('Kartın bitmə tarixi formatı düzgün deyil. Məsələn: 12/30');
      return false;
    }

    const month = Number(expiryMatch[1]);
    const shortYear = Number(expiryMatch[2]);
    const fullYear = 2000 + shortYear;
    const expiryDate = new Date(fullYear, month, 0, 23, 59, 59, 999);
    const now = new Date();

    if (expiryDate <= now) {
      showToast('Kartın istifadə müddəti bitib!');
      return false;
    }

    if (!/^\d{3,4}$/.test(cvc)) {
      showToast('CVC/CVV düzgün deyil. 3 və ya 4 rəqəm olmalıdır.');
      return false;
    }

    return true;
  }

  function populateServices(services) {
    if (!serviceSelect) return;
    serviceSelect.innerHTML = '<option value="">Seçin</option>' + (services || []).map((service) => (
      `<option value="${service.name}">${service.name}${Number(service.price || 0) > 0 ? ` — ${Number(service.price).toFixed(2)} ₼` : ''}</option>`
    )).join('');
  }

  function getServiceBadge(service) {
    const value = String(service?.category || service?.name || 'SERVICE').toUpperCase();
    return value.replace(/\s+/g, '_').slice(0, 18);
  }

  function renderServiceCards(services) {
    if (!serviceCards) return;
    if (!Array.isArray(services) || !services.length) {
      serviceCards.innerHTML = '<div class="loading-block">Hazır xidmət yoxdur.</div>';
      return;
    }

    serviceCards.innerHTML = services.map((service) => `
      <article class="svc-card">
        <div class="svc-tag">${getServiceBadge(service)}</div>
        <div class="svc-cat">${service.category || 'Genel'}</div>
        <h3>${service.name}</h3>
        <p>Peşəkar texniki yardım, dəqiq qiymətləndirmə və sürətli status izləmə.</p>
        <div class="svc-price-row">
          <span class="svc-price">${Number(service.price || 0).toFixed(2)} ₼</span>
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

  function setupOnsiteMap() {
    if (!document.getElementById('onsite-map')) return;
    if (typeof L === 'undefined') return;

    if (!onSiteMap) {
      onSiteMap = L.map('onsite-map', { zoomControl: true }).setView([40.4093, 49.8671], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(onSiteMap);

      onSiteMap.on('click', async (event) => {
        const { lat, lng } = event.latlng;
        if (!isWithinAzerbaijan(lat, lng)) {
          showToast('Azerbaycan hüdudları xaricində yerləşən ünvan seçilə bilməz.', 'error');
          return;
        }

        if (onSiteMarker) {
          onSiteMarker.setLatLng([lat, lng]);
        } else {
          onSiteMarker = L.marker([lat, lng]).addTo(onSiteMap);
        }

        onsiteLatInput.value = String(lat);
        onsiteLngInput.value = String(lng);

        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
          const data = await response.json();
          if (data && data.display_name) {
            onsiteAddressInput.value = data.display_name;
          }
        } catch (error) {
          console.error('reverse geocode failed:', error);
        }
      });
    }

    onsiteToggle?.addEventListener('change', () => {
      if (onsiteToggle.checked) {
        onsiteMapWrap.classList.add('visible');
      } else {
        onsiteMapWrap.classList.remove('visible');
      }
    });

    searchAddressBtn?.addEventListener('click', async () => {
      const query = onsiteAddressInput.value.trim();
      if (!query) {
        alert('Ünvanı yazın.');
        return;
      }

      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}`);
        const result = await response.json();
        if (!result || !result.length) {
          alert('Ünvan tapılmadı.');
          return;
        }

        const place = result[0];
        const lat = Number(place.lat);
        const lng = Number(place.lon);

        if (!isWithinAzerbaijan(lat, lng)) {
          showToast('Azerbaycan hüdudları içində ünvan seçin.', 'error');
          return;
        }

        onsiteAddressInput.value = place.display_name;
        onsiteLatInput.value = String(lat);
        onsiteLngInput.value = String(lng);

        if (onSiteMarker) {
          onSiteMarker.setLatLng([lat, lng]);
        } else {
          onSiteMarker = L.marker([lat, lng]).addTo(onSiteMap);
        }

        onSiteMap.setView([lat, lng], 14);
      } catch (error) {
        console.error('geocode failed:', error);
        alert('Ünvan axtarışında xəta baş verdi.');
      }
    });
  }

  function openPaymentModal() {
    if (paymentModal) {
      paymentModal.classList.add('open');
      paymentModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closePaymentModalFn() {
    if (paymentModal) {
      paymentModal.classList.remove('open');
      paymentModal.setAttribute('aria-hidden', 'true');
      paymentForm.reset();
    }
  }

  closePaymentModal?.addEventListener('click', closePaymentModalFn);
  paymentModal?.addEventListener('click', (event) => {
    if (event.target === paymentModal) closePaymentModalFn();
  });

  cardNumberInput?.addEventListener('input', () => {
    const digits = cardNumberInput.value.replace(/\D/g, '');
    const brand = detectCardBrand(digits);
    if (cardBrandBadge) {
      cardBrandBadge.textContent = brand.brand;
      cardBrandBadge.style.background = brand.accent;
      cardBrandBadge.style.color = '#081018';
    }
    cardNumberInput.value = digits.replace(/(.{4})/g, '$1 ').trim();
  });

  paymentForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeTrackingId) return;

    if (!validatePaymentDetails()) return;

    const payload = {
      card_number: cardNumberInput.value.trim(),
      expiry: cardExpiryInput.value.trim(),
      cvc: cardCvcInput.value.trim()
    };

    try {
      const response = await fetch(`/api/requests/${activeTrackingId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) {
        showToast(body.error || 'Ödəniş işlənə bilmədi.', 'error');
        return;
      }

      closePaymentModalFn();
      showToast('Ödəniş uğurla tamamlandı.', 'success');
      trackForm.dispatchEvent(new Event('submit'));
    } catch (error) {
      console.error('payment error:', error);
      showToast('Ödəniş zamanı xəta baş verdi.', 'error');
    }
  });

  requestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const isOnsite = Boolean(onsiteToggle && onsiteToggle.checked);
    const payload = {
      customer_name: document.getElementById('customer_name').value.trim(),
      customer_phone: document.getElementById('customer_phone').value.trim(),
      service_name: serviceSelect ? serviceSelect.value : '',
      device_info: document.getElementById('device_info').value.trim(),
      is_onsite: isOnsite,
      payment_method: paymentMethodSelect ? paymentMethodSelect.value : 'later',
      address: onsiteAddressInput ? onsiteAddressInput.value.trim() : '',
      latitude: onsiteLatInput ? Number(onsiteLatInput.value || 0) : 0,
      longitude: onsiteLngInput ? Number(onsiteLngInput.value || 0) : 0
    };

    if (!payload.customer_name || !payload.customer_phone || !payload.service_name) {
      setMessage('Ad, telefon və xidmət sahələrini doldurun.', 'error');
      return;
    }

    if (isOnsite && (!payload.address || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude))) {
      setMessage('Səyyar xidmət üçün ünvanı seçin və xəritədə nöqtə qoyun.', 'error');
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
      if (onsiteToggle) onsiteToggle.checked = false;
      if (onsiteMapWrap) onsiteMapWrap.classList.remove('visible');
      if (onsiteAddressInput) onsiteAddressInput.value = '';
      if (onsiteLatInput) onsiteLatInput.value = '';
      if (onsiteLngInput) onsiteLngInput.value = '';
      if (paymentMethodSelect) paymentMethodSelect.value = 'prepay';
      setMessage(`Müraciət yarandı. İzləmə kodu: ${body.tracking_code} · ${body.created_at}`, 'success');

      if (body.payment_method === 'prepay' && body.request_id) {
        activeTrackingId = Number(body.request_id);
        openPaymentModal();
      }
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
      activeTrackingId = request.id || null;
      resultService.textContent = request.service_name || '-';
      resultDevice.textContent = request.device_info || 'Cihaz məlumatı yoxdur';
      resultStatus.textContent = request.status || 'Gözləmədə';
      resultStatus.className = `status-chip ${statusClass(request.status)}`;
      resultCreated.textContent = formatDate(request.created_at);
      resultUpdated.textContent = formatDate(request.updated_at);
      resultQuoted.textContent = `${Number(request.quoted_price || 0).toFixed(2)} ₼`;
      resultFinal.textContent = `${Number(request.final_price || 0).toFixed(2)} ₼`;
      resultPaymentMethod.textContent = request.payment_method === 'prepay' ? 'Öncədən Ödəniş (Onlayn Kartla)' : 'Təmirdən / Təhvil Verildikdən Sonra Ödəniş';
      resultPaymentStatus.textContent = request.payment_status || 'Ödənilməyib';

      if (request.is_onsite && (request.address || request.latitude != null || request.longitude != null)) {
        resultAddressWrap.style.display = 'block';
        resultAddress.textContent = request.address || `${request.latitude}, ${request.longitude}`;
      } else {
        resultAddressWrap.style.display = 'none';
      }

      if (request.payment_method === 'prepay' && Number(request.final_price || 0) > 0 && (request.payment_status || 'Ödənilməyib') !== 'Ödənilib' && (request.payment_status || 'Ödənilməyib') !== 'Təhvil Veriləndə Ödənəcək') {
        payButtonWrap.style.display = 'block';
      } else {
        payButtonWrap.style.display = 'none';
      }

      trackingResult.style.display = 'block';
    } catch (error) {
      console.error('trackForm error:', error);
      alert('İzləmə məlumatı alınarkən xəta baş verdi.');
    }
  });

  payButton?.addEventListener('click', openPaymentModal);

  function initCustomerChat() {
    const sessionId = localStorage.getItem('hugu-chat-session') || `customer-${Date.now()}`;
    localStorage.setItem('hugu-chat-session', sessionId);

    const chatToggle = document.getElementById('chat-toggle');
    const chatPanel = document.getElementById('chat-panel');
    const chatMessages = document.getElementById('customer-chat-messages');
    const chatInput = document.getElementById('customer-chat-input');
    const chatSend = document.getElementById('customer-chat-send');
    const closeChat = document.getElementById('chat-close');

    async function loadChatHistory() {
      if (!chatMessages) return;
      try {
        const response = await fetch(`/api/chat/history/${encodeURIComponent(sessionId)}`);
        const data = await response.json();
        const messages = data.messages || [];
        chatMessages.innerHTML = messages.map((msg) => `
          <div class="chat-bubble ${msg.sender_type === 'customer' ? 'customer' : 'admin'}">${msg.message}</div>
        `).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } catch (error) {
        console.error('loadChatHistory error:', error);
      }
    }

    chatToggle?.addEventListener('click', () => {
      const isVisible = chatPanel && chatPanel.style.display !== 'none';
      if (chatPanel) chatPanel.style.display = isVisible ? 'none' : 'block';
    });

    closeChat?.addEventListener('click', () => {
      if (chatPanel) chatPanel.style.display = 'none';
    });

    chatSend?.addEventListener('click', async () => {
      const message = (chatInput?.value || '').trim();
      if (!message) return;
      if (chatInput) chatInput.value = '';
      try {
        await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, sender_type: 'customer', message })
        });
        await loadChatHistory();
      } catch (error) {
        console.error('customer chat send error:', error);
      }
    });

    chatInput?.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        chatSend?.click();
      }
    });

    setInterval(loadChatHistory, 4000);
    loadChatHistory();
  }

  const savedTheme = localStorage.getItem('hugu-theme') || 'dark';
  applyTheme(savedTheme);
  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('theme-light') ? 'dark' : 'light';
    applyTheme(nextTheme);
  });

  setupOnsiteMap();
  initCustomerChat();
  loadServices();
});
