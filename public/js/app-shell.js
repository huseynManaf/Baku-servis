(() => {
  const body = document.body;
  const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android' || /BakuServisApp|; wv\)|Capacitor/i.test(navigator.userAgent));
  if (isNativeApp) {
    body.classList.add('native-app');
    localStorage.setItem('bakuservis-theme', 'dark');
  }
  const drawer = document.getElementById('navigation-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const drawerTrigger = document.getElementById('drawer-trigger');
  const drawerClose = document.getElementById('drawer-close');
  const links = [...document.querySelectorAll('[data-screen-link]')];
  const screens = [...document.querySelectorAll('.app-screen[data-screen]')];

  function closeDrawer() {
    drawer?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.hidden = true;
    drawerTrigger?.setAttribute('aria-expanded', 'false');
  }

  function setScreen(screen) {
    if (!screen) return;
    if (screen === 'tracking') screen = 'my-requests';
    body.classList.add('app-screen-mode');
    body.classList.toggle('form-focus-mode', ['request', 'my-requests', 'contact'].includes(screen));
    screens.forEach((item) => item.dataset.screenActive = item.dataset.screen === screen ? 'true' : 'false');
    links.forEach((link) => link.classList.toggle('is-active', link.dataset.screenLink === screen || (screen === 'my-requests' && link.dataset.screenLink === 'tracking')));
    localStorage.setItem('bakuservis-screen', screen);
    window.dispatchEvent(new CustomEvent('bakuservis:screen', { detail: screen }));
    closeDrawer();
    const target = document.querySelector(`[data-screen="${screen}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.BakuServisNavigation = { go: setScreen };

  drawerTrigger?.addEventListener('click', () => {
    drawer?.classList.add('is-open');
    drawer?.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.hidden = false;
    drawerTrigger.setAttribute('aria-expanded', 'true');
  });
  drawerClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  links.forEach((link) => link.addEventListener('click', (event) => {
    if (link.dataset.screenLink) {
      event.preventDefault();
      setScreen(link.dataset.screenLink);
    }
  }));

  document.querySelectorAll('[data-open-chat]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById('chat-toggle-btn')?.click();
    });
  });

  const initialScreen = localStorage.getItem('bakuservis-screen') || 'home';
  setScreen(initialScreen);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      window.BakuServisPush = {
        async refresh(trackingCode) {
          if (!trackingCode || !('PushManager' in window) || !('Notification' in window)) return;
          const keyResponse = await fetch('/api/push/public-key');
          if (!keyResponse.ok) return;
          const { publicKey } = await keyResponse.json();
          if (!publicKey) return;
          const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
          if (permission !== 'granted') return;
          const paddedKey = `${publicKey}${'='.repeat((4 - publicKey.length % 4) % 4)}`;
          const applicationServerKey = Uint8Array.from(atob(paddedKey.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
          const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
          await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracking_code: trackingCode, subscription }) });
        }
      };
    }).catch((error) => console.warn('Service worker registration failed:', error));
  }

  if (window.io) {
    const socket = window.io({ transports: ['websocket', 'polling'] });
    socket.on('request:status-updated', (payload) => window.dispatchEvent(new CustomEvent('bakuservis:status', { detail: payload.request })));
  }
})();