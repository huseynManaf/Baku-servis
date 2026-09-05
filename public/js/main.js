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
  const customerPhoneInput = document.getElementById('customer_phone');
  const postSubmitChoice = document.getElementById('post-submit-choice');
  const paymentConfirmation = document.getElementById('payment-confirmation');
  const payNowBtn = document.getElementById('pay-now-btn');
  const payLaterBtn = document.getElementById('pay-later-btn');
  const liveBoard = document.getElementById('live-board');
  const requestSubmitButton = requestForm?.querySelector('button[type="submit"]');
  let activeTrackingId = null;
  let requestSubmitting = false;
  const AZERBAIJANI_PHONE_REGEX = /^(?:\+?994|0)?\s?(?:50|51|55|70|77|99|10|60)\s?\d{3}\s?\d{2}\s?\d{2}$/;

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

  function sanitizePhone(value) {
    const raw = String(value || '').trim();
    const hasLeadingPlus = raw.startsWith('+');
    const digits = raw.replace(/\D/g, '');
    return hasLeadingPlus ? `+${digits}` : digits;
  }

  function isValidAzerbaijaniPhone(value) {
    return AZERBAIJANI_PHONE_REGEX.test(sanitizePhone(value));
  }

  function normalizePhone(value) {
    const digits = sanitizePhone(value).replace(/\D/g, '');
    if (!digits) return '';
    const withoutCountry = digits.startsWith('994') ? digits.slice(3) : digits;
    return withoutCountry.replace(/^0+/, '');
  }

  function formatPhoneValue(value) {
    const digits = normalizePhone(value);
    if (!digits) return '';
    if (digits.length <= 2) return `+994 ${digits}`;
    if (digits.length <= 5) return `+994 ${digits.slice(0, 2)} ${digits.slice(2)}`;
    if (digits.length <= 7) return `+994 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    return `+994 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }

  function applyTheme(theme) {
    const root = document.body;
    const resolved = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = resolved;
    root.classList.toggle('theme-light', resolved === 'light');
    if (themeToggle) themeToggle.textContent = resolved === 'light' ? 'Qaranlıq' : 'Açıq';
    localStorage.setItem('bakuservis-theme', resolved);
  }

  function getStoredCustomerIdentity() {
    try {
      const raw = localStorage.getItem('bakuservis-customer-identity');
      return raw ? JSON.parse(raw) : { name: '', phone: '' };
    } catch (error) {
      return { name: '', phone: '' };
    }
  }

  function setStoredCustomerIdentity(name, phone) {
    const next = {
      name: String(name || '').trim(),
      phone: String(phone || '').trim()
    };
    localStorage.setItem('bakuservis-customer-identity', JSON.stringify(next));
    return next;
  }

  function isWithinAzerbaijan(lat, lng) {
    return Number(lat) >= 38.3 && Number(lat) <= 41.9 && Number(lng) >= 44.7 && Number(lng) <= 50.9;
  }

  document.addEventListener('click', (event) => {
    const telLink = event.target.closest('[data-tel]');
    if (!telLink) return;
    event.preventDefault();
    const telValue = telLink.getAttribute('data-tel');
    if (telValue) {
      window.location.href = telValue;
    }
  });

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

  function getLiveBoardStatusClass(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value.includes('gözləm') || value.includes('pending')) return 'status-yeni';
    if (value.includes('icra') || value.includes('in work') || value.includes('process')) return 'status-icrada';
    if (value.includes('hazır') || value.includes('ready')) return 'status-hazir';
    if (value.includes('təhvil') || value.includes('verildi') || value.includes('delivered')) return 'status-teslim';
    return 'status-qiymetlendirildi';
  }

  function getLiveBoardStatusLabel(status) {
    const value = String(status || '').trim();
    if (!value) return 'Gözləmədə';
    if (value.toLowerCase().includes('gözləm')) return 'Gözləmədə';
    if (value.toLowerCase().includes('icra')) return 'İcrada';
    if (value.toLowerCase().includes('hazır')) return 'Hazırdır';
    if (value.toLowerCase().includes('təhvil') || value.toLowerCase().includes('verildi')) return 'Təhvil verildi';
    return value;
  }

  function renderLiveBoard(orders) {
    if (!liveBoard) return;

    const fallback = [
      { service_name: 'Laptop Format', device_model: 'Lenovo ThinkPad', status: 'İcrada' },
      { service_name: 'Virus Təmizliyi', device_model: 'HP Pavilion', status: 'Hazırdır' },
      { service_name: 'SSD Quraşdırma', device_model: 'Dell Latitude', status: 'Qiymətləndirildi' },
      { service_name: 'BIOS Reset', device_model: 'Acer Aspire', status: 'Gözləmədə' }
    ];

    const items = Array.isArray(orders) && orders.length ? orders : fallback;
    liveBoard.innerHTML = items.map((item) => `
      <div class="ticket">
        <div>
          <div class="tname">${String(item.service_name || 'Xidmət').trim() || 'Xidmət'}</div>
          <div class="tdev">${String(item.device_model || 'Model bilinmir').trim() || 'Model bilinmir'}</div>
        </div>
        <span class="status-chip ${getLiveBoardStatusClass(item.status)}">${getLiveBoardStatusLabel(item.status)}</span>
      </div>
    `).join('');
  }

  async function refreshLiveBoard() {
    try {
      const response = await fetch('/api/orders/live-board');
      if (!response.ok) throw new Error(`Live board request failed: ${response.status}`);
      const data = await response.json();
      renderLiveBoard(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      console.error('refreshLiveBoard error:', error);
      renderLiveBoard([]);
    }
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
        const orderSection = document.querySelector('#order-section');
        const firstNameInput = document.getElementById('customer_name');

        if (serviceSelect) {
          serviceSelect.value = name;
        }

        if (orderSection) {
          orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (firstNameInput) {
          setTimeout(() => {
            firstNameInput.focus({ preventScroll: true });
          }, 220);
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
      window.map = onSiteMap;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(onSiteMap);

      setTimeout(() => {
        if (window.map) {
          window.map.invalidateSize();
          window.map.setView([40.4093, 49.8671], 12);
        }
      }, 200);

      window.addEventListener('load', () => {
        setTimeout(() => {
          if (window.map) {
            window.map.invalidateSize();
            window.map.setView([40.4093, 49.8671], 12);
          }
        }, 200);
      });

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
        setTimeout(() => {
          if (window.map) {
            window.map.invalidateSize();
            window.map.setView([40.4093, 49.8671], 12);
          }
        }, 200);
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

  function setPaymentConfirmation(isVisible, message = '✅ Ödəniş üsulu təsdiqləndi: Təhvil veriləndə ödəniləcək') {
    if (!paymentConfirmation) return;
    paymentConfirmation.style.display = isVisible ? 'block' : 'none';
    paymentConfirmation.textContent = message;
  }

  function showPaymentChoicePanel(request = null) {
    if (!postSubmitChoice) return;

    const normalizedPaymentMethod = String(request?.payment_method || '').toLowerCase();
    const normalizedPaymentStatus = String(request?.payment_status || '').toLowerCase();
    const shouldConfirmCash = normalizedPaymentMethod === 'later' || normalizedPaymentStatus.includes('təhvil') || normalizedPaymentStatus.includes('veril') || normalizedPaymentStatus.includes('cash');

    if (!request || (request.payment_status || 'Ödənilməyib') === 'Ödənilib') {
      postSubmitChoice.style.display = 'none';
      setPaymentConfirmation(false);
      return;
    }

    if (shouldConfirmCash) {
      postSubmitChoice.style.display = 'none';
      setPaymentConfirmation(true, '✅ Ödəniş üsulu təsdiqləndi: Təhvil veriləndə ödəniləcək');
      return;
    }

    postSubmitChoice.style.display = 'block';
    setPaymentConfirmation(false);
    postSubmitChoice.dataset.requestId = request.id || activeTrackingId || '';

    const text = request.payment_method === 'prepay'
      ? 'Ödəniş seçimi: kartla əvvəlcədən ödəniş və ya təhvil alarkən ödə.'
      : 'Bu sifariş hələ ödənilməmişdir. Siz istədiyiniz ödəniş üsulunu seçə bilərsiniz.';

    const title = postSubmitChoice.querySelector('.choice-title');
    const description = postSubmitChoice.querySelector('.choice-description');
    if (title) title.textContent = 'Ödəniş seçimi';
    if (description) description.textContent = text;

    const selectedRequestId = Number(request.id || activeTrackingId || 0);
    if (payNowBtn) {
      payNowBtn.onclick = () => {
        if (selectedRequestId) activeTrackingId = selectedRequestId;
        openPaymentModal();
      };
    }

    if (payLaterBtn) {
      payLaterBtn.onclick = async () => {
        if (!selectedRequestId) return;
        try {
          const response = await fetch(`/api/requests/${selectedRequestId}/confirm-cash`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const body = await response.json();
          if (!response.ok) {
            showToast(body.error || 'Ödəniş seçimində xəta baş verdi.', 'error');
            return;
          }
          postSubmitChoice.style.display = 'none';
          setPaymentConfirmation(true, '✅ Ödəniş üsulu təsdiqləndi: Təhvil veriləndə ödəniləcək');
          showToast('Sifariş “Təhvil veriləndə ödənəcək” kimi qeydləndi.', 'success');
          if (resultPaymentStatus) {
            resultPaymentStatus.textContent = body.payment_status || 'Təhvil veriləndə ödənəcək';
          }
          if (resultStatus) {
            resultStatus.textContent = body.status || 'Təhvil veriləndə ödənəcək';
            resultStatus.className = `status-chip ${statusClass(body.status)}`;
          }
          if (trackForm) trackForm.dispatchEvent(new Event('submit'));
        } catch (error) {
          console.error('cash selection error:', error);
          showToast('Təhvil alarkən ödəniş qeyd edilmədi.', 'error');
        }
      };
    }
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

  customerPhoneInput?.addEventListener('input', () => {
    const sanitized = sanitizePhone(customerPhoneInput.value);
    customerPhoneInput.value = sanitized;
    customerPhoneInput.setCustomValidity(isValidAzerbaijaniPhone(sanitized) ? '' : 'Düzgün Azərbaycan mobil nömrəsi daxil edin.');
  });

  customerPhoneInput?.addEventListener('blur', () => {
    const sanitized = sanitizePhone(customerPhoneInput.value);
    if (isValidAzerbaijaniPhone(sanitized)) {
      customerPhoneInput.value = formatPhoneValue(sanitized);
    }
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
    if (requestSubmitting) return;
    requestSubmitting = true;
    if (requestSubmitButton) {
      requestSubmitButton.disabled = true;
      requestSubmitButton.classList.add('loading');
    }

    try {
      const isOnsite = Boolean(onsiteToggle && onsiteToggle.checked);
      const submittedPhone = sanitizePhone(document.getElementById('customer_phone').value);
      const customerPhone = normalizePhone(submittedPhone);
      const payload = {
        customer_name: document.getElementById('customer_name').value.trim(),
        customer_phone: customerPhone,
        service_name: serviceSelect ? serviceSelect.value : '',
        device_info: document.getElementById('device_info').value.trim(),
        is_onsite: isOnsite,
        payment_method: paymentMethodSelect ? paymentMethodSelect.value : 'later',
        address: onsiteAddressInput ? onsiteAddressInput.value.trim() : '',
        latitude: onsiteLatInput ? Number(onsiteLatInput.value || 0) : 0,
        longitude: onsiteLngInput ? Number(onsiteLngInput.value || 0) : 0,
        idempotency_key: globalThis.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2)}`
      };

      if (!payload.customer_name || !payload.customer_phone || !payload.service_name) {
        setMessage('Ad, telefon və xidmət sahələrini doldurun.', 'error');
        return;
      }

      if (!isValidAzerbaijaniPhone(submittedPhone)) {
        setMessage('Düzgün Azərbaycan mobil nömrəsi daxil edin. Məsələn: +994 50 123 45 67', 'error');
        return;
      }

      if (isOnsite && (!payload.address || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude))) {
        setMessage('Səyyar xidmət üçün ünvanı seçin və xəritədə nöqtə qoyun.', 'error');
        return;
      }

      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      const isSuccess = response.ok && (body.success !== false) && (!!body.tracking_code || !!body.request_id || !!body.ok);

      if (!isSuccess) {
        setMessage(body.error || 'Müraciət göndərilmədi.', 'error');
        return;
      }

      const customerName = document.getElementById('customer_name').value.trim();
      setStoredCustomerIdentity(customerName, customerPhone);

      requestForm.reset();
      if (onsiteToggle) onsiteToggle.checked = false;
      if (onsiteMapWrap) onsiteMapWrap.classList.remove('visible');
      if (onsiteAddressInput) onsiteAddressInput.value = '';
      if (onsiteLatInput) onsiteLatInput.value = '';
      if (onsiteLngInput) onsiteLngInput.value = '';
      if (paymentMethodSelect) paymentMethodSelect.value = 'prepay';
      setMessage(`Müraciət yarandı. İzləmə kodu: ${body.tracking_code || 'HG-XXXXXX'} · ${body.created_at || 'indiki vaxt'}`, 'success');

      if (body.request_id) {
        activeTrackingId = Number(body.request_id);
        showPaymentChoicePanel({
          id: activeTrackingId,
          payment_method: body.payment_method || 'later',
          payment_status: body.payment_status || 'Ödənilməyib',
          final_price: 0
        });
      }
    } catch (error) {
      console.error('requestForm error:', error);
      setMessage('Serverə qoşularkən xəta baş verdi.', 'error');
    } finally {
      requestSubmitting = false;
      if (requestSubmitButton) {
        requestSubmitButton.disabled = false;
        requestSubmitButton.classList.remove('loading');
      }
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
      if (request.customer_name || request.customer_phone) {
        setStoredCustomerIdentity(request.customer_name, request.customer_phone);
      }
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
      showPaymentChoicePanel(request);

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
    const sessionId = localStorage.getItem('bakuservis-chat-session') || `customer-${Date.now()}`;
    localStorage.setItem('bakuservis-chat-session', sessionId);
    const identity = getStoredCustomerIdentity();

    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    const chatPanel = document.getElementById('chat-panel');
    const chatMessages = document.getElementById('customer-chat-messages');
    const chatInput = document.getElementById('customer-chat-input');
    const chatSend = document.getElementById('customer-chat-send');
    const closeChat = document.getElementById('chat-close');
    const greetingText = 'Salam! Baku Servis peşəkar texniki dəstək mərkəzinə xoş gəlmisiniz. Sizə necə kömək edə bilərəm? 🛠️';

    function setChatOpen(isOpen) {
      if (!chatPanel) return;
      chatPanel.style.display = isOpen ? 'block' : 'none';
      chatPanel.classList.toggle('is-open', isOpen);
      chatPanel.setAttribute('aria-hidden', String(!isOpen));
      if (chatToggleBtn) {
        chatToggleBtn.setAttribute('aria-expanded', String(isOpen));
      }
      if (isOpen && chatInput) {
        requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
      }
    }

    async function showInitialGreeting() {
      if (!chatPanel || !chatMessages) return;
      const alreadyShown = localStorage.getItem('bakuservis-chat-greeting-shown') === 'true';
      if (alreadyShown) return;

      try {
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            sender_type: 'bot',
            message: greetingText,
            customer_name: identity.name,
            customer_phone: identity.phone
          })
        });

        if (response.ok) {
          localStorage.setItem('bakuservis-chat-greeting-shown', 'true');
          await loadChatHistory();
        }
      } catch (error) {
        console.error('initial bot greeting error:', error);
      }
    }

    async function loadChatHistory() {
      if (!chatMessages) return;
      try {
        const response = await fetch(`/api/chat/history/${encodeURIComponent(sessionId)}`);
        if (!response.ok) {
          chatMessages.innerHTML = '';
          return;
        }

        const data = await response.json();
        const messages = Array.isArray(data?.messages) ? data.messages : [];
        chatMessages.innerHTML = messages.map((msg) => {
          const sender = String(msg.sender_type || 'customer');
          const isCustomer = sender === 'customer';
          const isAdmin = sender === 'admin';
          const isBot = sender === 'bot';
          const label = isBot ? '🤖 Baku AI' : isAdmin ? '👨‍💼 Baku Team' : '🧑 Müşteri';
          const className = isBot ? 'bot' : isAdmin ? 'admin' : 'customer';

          return `
            <div class="chat-bubble ${className}">
              <span class="chat-badge">${label}</span>
              <div class="chat-message">${String(msg.message || '').replace(/\n/g, '<br>')}</div>
            </div>
          `;
        }).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } catch (error) {
        console.error('loadChatHistory error:', error);
        if (chatMessages) chatMessages.innerHTML = '';
      }
    }

    chatToggleBtn?.addEventListener('click', async () => {
      const isVisible = chatPanel && chatPanel.style.display !== 'none';
      const nextState = !isVisible;
      setChatOpen(nextState);
      if (nextState) {
        await showInitialGreeting();
      }
    });

    chatInput?.addEventListener('focus', () => setChatOpen(true));

    closeChat?.addEventListener('click', () => {
      setChatOpen(false);
    });

    chatSend?.addEventListener('click', async () => {
      const message = (chatInput?.value || '').trim();
      if (!message) return;
      if (chatInput) chatInput.value = '';
      try {
        const identity = getStoredCustomerIdentity();
        await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            sender_type: 'customer',
            message,
            customer_name: identity.name,
            customer_phone: identity.phone
          })
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

  const savedTheme = localStorage.getItem('bakuservis-theme') || 'dark';
  applyTheme(savedTheme);
  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
  });

  setupOnsiteMap();
  initCustomerChat();
  loadServices();
  refreshLiveBoard();
  setInterval(refreshLiveBoard, 15000);
});
