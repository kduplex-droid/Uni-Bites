<script>
/* ============================================================
 * MUNCHIE v2 — FIREBASE-POWERED SNACK SHOP
 * ============================================================
 * Setup: Open in browser, paste Firebase config on the setup screen.
 * Get config from: console.firebase.google.com → Project Settings → Web App
 * ============================================================ */

// ── CONFIG (loaded from localStorage after setup) ──────────
let FIREBASE_CONFIG = { apiKey: 'UNCONFIGURED' };
let ADMIN_EMAILS = [];

function loadConfig() {
  const saved = localStorage.getItem('munchie_config');
  if (saved) {
    try {
      const c = JSON.parse(saved);
      FIREBASE_CONFIG = c.firebase;
      ADMIN_EMAILS = c.admins || [];
      return true;
    } catch(e) { return false; }
  }
  return false;
}

function saveSetup() {
  const rawConfig = document.getElementById('firebase-config-input').value.trim();
  const adminEmail = document.getElementById('setup-admin-email').value.trim();
  const errEl = document.getElementById('setup-error');
  errEl.style.display = 'none';
  try {
    const cfg = JSON.parse(rawConfig);
    if (!cfg.apiKey || !cfg.projectId) throw new Error('Missing keys');
    const bundle = { firebase: cfg, admins: adminEmail ? [adminEmail] : [] };
    localStorage.setItem('munchie_config', JSON.stringify(bundle));
    window.location.reload();
  } catch(e) {
    errEl.style.display = 'block';
  }
}

// ── FIREBASE INITIALIZATION & AUTH ──────────────────────────
let db;
let auth;
let storage;

// TODO: Replace with your actual email address
const AUTHORIZED_ADMINS = ['k.duplex16@gmail.com'];

function initFirebase() {
  try {
    const configString = localStorage.getItem('firebase_config');
    if (!configString) throw new Error("No configuration found in localStorage.");
    
    const config = JSON.parse(configString);
    
    // Initialize Core Firebase App
    firebase.initializeApp(config);
    
    // Bind services globally
    db = firebase.firestore();
    auth = firebase.auth();
    storage = firebase.storage();
    
    console.log("Firebase services successfully initialized.");
    setupAuthObserver(); 
  } catch (error) {
    console.error("Initialization failed:", error);
    document.getElementById('setup-screen').style.display = 'flex';
    document.getElementById('top-nav').style.display = 'none';
  }
}

function setupAuthObserver() {
  auth.onAuthStateChanged((user) => {
    // Finds your existing admin dashboard section
    const adminPanel = document.getElementById('admin-panel'); 
    
    if (user) {
      if (AUTHORIZED_ADMINS.includes(user.email.toLowerCase())) {
        console.log("Access Granted: Administrator verified.");
        if (adminPanel) adminPanel.style.display = 'block';
      } else {
        console.warn("Access Denied: Restricting standard user profile.");
        if (adminPanel) adminPanel.style.display = 'none';
      }
    } else {
      if (adminPanel) adminPanel.style.display = 'none';
    }
  });
}

// Secret Keyboard Shortcut (Ctrl + Shift + A)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    document.getElementById('admin-gate-screen').style.display = 'flex';
    document.getElementById('admin-email').focus();
  }
});

// Handler for the hidden login form submission
function handleAdminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('admin-gate-error');
  
  if (errorEl) errorEl.style.display = 'none';
  
  if (!email || !password) {
    if (errorEl) { errorEl.textContent = "Please fill in all fields."; errorEl.style.display = 'block'; }
    return;
  }

  if (!AUTHORIZED_ADMINS.includes(email.toLowerCase())) {
    if (errorEl) { errorEl.textContent = "Invalid administrative credentials."; errorEl.style.display = 'block'; }
    return;
  }

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      document.getElementById('admin-email').value = '';
      document.getElementById('admin-password').value = '';
      document.getElementById('admin-gate-screen').style.display = 'none';
    })
    .catch((error) => {
      if (errorEl) { errorEl.textContent = "Authentication failed: " + error.message; errorEl.style.display = 'block'; }
    });
}

// ── STATE ──────────────────────────────────────────────────
const APP = {
  user: null, isAdmin: false,
  products: [], cart: [], promoApplied: false,
  currentFilter: 'all', currentCampus: 'upper',
  orderNum: null, etaTime: null,
  pendingImageUrl: null, currentAuthTab: 'in',
};

// ── RESIDENCES ─────────────────────────────────────────────
const RESIDENCES = {
  upper: ['Smuts Hall','Fuller Hall','Kopano','Tugwell Hall','Hlanganani Hall','Liesbeeck Gardens','Rouwkuil','Leo Marquard Hall','Edith Stephen Hall','Graça Machel Hall'],
  middle: ['Properties House','Groote Schuur','De Waal House'],
};

// ── NAVIGATION ─────────────────────────────────────────────
const CUSTOMER_SCREENS = ['home','auth','shop','cart','checkout','confirm','tracking'];
const BNAV_MAP = { home:'bnav-home', shop:'bnav-shop', cart:'bnav-cart', auth:'bnav-auth' };
let currentScreen = 'home';

function navigate(screen, filterCat) {
  // Admin guard — block unauthenticated / non-admin access
  if (screen === 'admin' && !APP.isAdmin) {
    showAdminLoginOverlay();
    return;
  }
  currentScreen = screen;
  const isAdmin = screen === 'admin';
  document.getElementById('top-nav').style.display = isAdmin ? 'none' : '';
  document.getElementById('marquee-bar').style.display = isAdmin ? 'none' : '';
  document.getElementById('bottom-nav').style.display = isAdmin ? 'none' : '';
  document.getElementById('admin-screen').style.display = isAdmin ? 'block' : 'none';

  CUSTOMER_SCREENS.forEach(s => {
    const el = document.getElementById(s+'-screen');
    if (el) el.classList.toggle('active', s === screen);
  });
  Object.keys(BNAV_MAP).forEach(k => {
    document.getElementById(BNAV_MAP[k])?.classList.toggle('active', k === screen);
  });

  if (screen === 'home') renderProductGrid('home-products', true);
  if (screen === 'shop') { if(filterCat) setFilterByKey(filterCat); renderProductGrid('shop-products', false); }
  if (screen === 'cart') renderCart();
  if (screen === 'checkout') renderCheckoutSummary();
  if (screen === 'tracking') renderTracking();
  if (screen === 'admin') { renderAdminPanel(); startOrdersListener(); }
  window.scrollTo(0, 0);
}

// ── AUTH ───────────────────────────────────────────────────
function signInWithGoogle() {
  const btn = document.getElementById('google-btn');
  btn.disabled = true; btn.textContent = 'Redirecting...';
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => { showAuthMsg('', ''); })
    .catch(err => { showAuthMsg('error', err.message); })
    .finally(() => { btn.disabled = false; btn.innerHTML = '<svg class="g-logo" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Continue with Google'; });
}

function sendMagicLink() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email || !email.includes('@')) {
    document.getElementById('auth-email').style.borderColor = 'var(--red)';
    setTimeout(() => document.getElementById('auth-email').style.borderColor = '', 1500);
    return;
  }
  const btn = document.getElementById('magic-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  const actionCodeSettings = { url: window.location.href, handleCodeInApp: true };
  auth.sendSignInLinkToEmail(email, actionCodeSettings)
    .then(() => {
      localStorage.setItem('munchie_email_for_signin', email);
      document.getElementById('sent-email-pill').textContent = email;
      document.getElementById('auth-form-inner').style.display = 'none';
      document.getElementById('magic-sent').style.display = 'block';
    })
    .catch(err => { showAuthMsg('error', 'Could not send link: ' + err.message); })
    .finally(() => { btn.disabled = false; btn.textContent = 'Send login link'; });
}

function resendLink() {
  const email = localStorage.getItem('munchie_email_for_signin');
  if (email) {
    document.getElementById('auth-email').value = email;
    document.getElementById('auth-form-inner').style.display = 'block';
    document.getElementById('magic-sent').style.display = 'none';
    sendMagicLink();
  }
}

function backToForm() {
  document.getElementById('auth-form-inner').style.display = 'block';
  document.getElementById('magic-sent').style.display = 'none';
}

function checkEmailLink() {
  if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('munchie_email_for_signin');
    if (!email) email = window.prompt('Please confirm your email address:');
    if (email) {
      auth.signInWithEmailLink(email, window.location.href)
        .then(() => {
          localStorage.removeItem('munchie_email_for_signin');
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(err => showAuthMsg('error', 'Sign-in failed: ' + err.message));
    }
  }
}

function signOut() {
  auth.signOut().then(() => navigate('home'));
}

function showAuthMsg(type, msg) {
  const el = document.getElementById('auth-msg');
  el.className = 'auth-msg' + (type ? ' ' + type : '');
  el.textContent = msg;
  el.style.display = type ? 'block' : 'none';
}

// ── ADMIN LOGIN OVERLAY ────────────────────────────────────
function showAdminLoginOverlay() {
  // Reset overlay state
  document.getElementById('admin-login-overlay').classList.add('show');
  document.getElementById('admin-access-denied').style.display = 'none';
  document.getElementById('admin-login-msg').style.display = 'none';
  document.getElementById('admin-magic-sent').style.display = 'none';
  document.getElementById('admin-login-form').style.display = 'block';
  document.getElementById('admin-login-email').value = '';
  document.getElementById('admin-magic-btn').disabled = false;
  document.getElementById('admin-magic-btn').textContent = 'Send secure login link';
  // If already logged in but not admin, show denial immediately
  if (APP.user && !APP.isAdmin) {
    document.getElementById('admin-access-denied').style.display = 'block';
  }
}

function cancelAdminLogin() {
  document.getElementById('admin-login-overlay').classList.remove('show');
}

function adminSignInWithGoogle() {
  const btn = document.getElementById('admin-google-btn');
  btn.disabled = true;
  btn.innerHTML = '<span style="font-size:13px">Signing in...</span>';
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(result => {
      if (!ADMIN_EMAILS.includes(result.user.email)) {
        document.getElementById('admin-access-denied').style.display = 'block';
        showAdminLoginMsg('', '');
        auth.signOut();
      }
      // onAuthStateChanged will handle redirect to admin if isAdmin
    })
    .catch(err => {
      if (err.code !== 'auth/popup-closed-by-user') showAdminLoginMsg('error', err.message);
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = '<svg class="g-logo" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Continue with Google';
    });
}

function adminSendMagicLink() {
  const email = document.getElementById('admin-login-email').value.trim();
  if (!email || !email.includes('@')) {
    document.getElementById('admin-login-email').style.borderColor = 'var(--red)';
    setTimeout(() => document.getElementById('admin-login-email').style.borderColor = '', 1500);
    return;
  }
  if (!ADMIN_EMAILS.includes(email)) {
    document.getElementById('admin-access-denied').style.display = 'block';
    return;
  }
  const btn = document.getElementById('admin-magic-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  const actionSettings = { url: window.location.href, handleCodeInApp: true };
  auth.sendSignInLinkToEmail(email, actionSettings)
    .then(() => {
      localStorage.setItem('munchie_admin_email_signin', email);
      localStorage.setItem('munchie_email_for_signin', email); // shared handler
      document.getElementById('admin-sent-email-pill').textContent = email;
      document.getElementById('admin-login-form').style.display = 'none';
      document.getElementById('admin-magic-sent').style.display = 'block';
    })
    .catch(err => showAdminLoginMsg('error', 'Could not send link: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = 'Send secure login link'; });
}

function adminResendLink() {
  const email = localStorage.getItem('munchie_admin_email_signin');
  if (email) {
    document.getElementById('admin-login-email').value = email;
    document.getElementById('admin-magic-sent').style.display = 'none';
    document.getElementById('admin-login-form').style.display = 'block';
    adminSendMagicLink();
  }
}

function showAdminLoginMsg(type, msg) {
  const el = document.getElementById('admin-login-msg');
  el.className = 'auth-msg' + (type ? ' ' + type : '');
  el.textContent = msg;
  el.style.display = type ? 'block' : 'none';
}

function setAuthTab(tab, el) {
  APP.currentAuthTab = tab;
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('auth-title').textContent = tab === 'in' ? 'Welcome back' : 'Create your account';
  document.getElementById('auth-sub').textContent = tab === 'in' ? 'Sign in to place your order.' : 'Join UCT students getting snacks delivered.';
  document.getElementById('magic-btn').textContent = tab === 'in' ? 'Send login link' : 'Create account & send link';
}

function checkStudentEmail(val) {
  const show = APP.currentAuthTab === 'up' && val.includes('.ac.za');
  document.getElementById('student-hint').style.display = show ? 'block' : 'none';
}

auth.onAuthStateChanged(user => {
  APP.user = user;
  APP.isAdmin = user && ADMIN_EMAILS.includes(user.email);
  const adminBtn = document.getElementById('admin-link-btn');
  adminBtn.classList.toggle('show', APP.isAdmin);
  adminBtn.textContent = APP.isAdmin ? 'ADMIN' : '🔒';
  const overlayVisible = document.getElementById('admin-login-overlay').classList.contains('show');
  if (user) {
    document.getElementById('user-info-bar').classList.add('show');
    document.getElementById('auth-card').style.display = 'none';
    document.getElementById('user-display-name').textContent = user.displayName || 'UCT Student';
    document.getElementById('user-display-email').textContent = user.email;
    document.getElementById('admin-user-email').textContent = user.email;
    // If admin login overlay was showing and user just signed in as admin → go to panel
    if (overlayVisible && APP.isAdmin) {
      document.getElementById('admin-login-overlay').classList.remove('show');
      navigate('admin');
    } else if (overlayVisible && !APP.isAdmin) {
      // Logged in but not admin — show denial
      document.getElementById('admin-access-denied').style.display = 'block';
    } else if (currentScreen === 'auth') {
      navigate(APP.isAdmin ? 'admin' : 'home');
    }
  } else {
    document.getElementById('user-info-bar').classList.remove('show');
    document.getElementById('auth-card').style.display = 'block';
  }
});

// ── PRODUCTS (Firestore) ───────────────────────────────────
function startProductListener() {
  db.collection('products').orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      APP.products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (currentScreen === 'home') renderProductGrid('home-products', true);
      if (currentScreen === 'shop') renderProductGrid('shop-products', false);
      if (currentScreen === 'admin') renderAdminPanel();
    }, err => console.error('Products listener error:', err));
}

function productCardHTML(p) {
  const imgContent = p.imageUrl
    ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy">`
    : `<span style="font-size:42px">${p.emoji || '🍬'}</span>`;
  return `<div class="prod-card">
    <div class="prod-img" style="${p.imageUrl ? '' : 'background:'+getCatBg(p.category)}">
      ${p.isHot ? '<span class="prod-badge">🔥 HOT</span>' : ''}
      ${imgContent}
    </div>
    <div class="prod-info">
      <div class="prod-brand">${p.brand || ''}</div>
      <div class="prod-name">${p.name}</div>
      <div class="prod-row">
        <span class="prod-price">R${p.price}</span>
        <button class="add-btn" id="add-${p.id}" onclick="addToCart('${p.id}')">+</button>
      </div>
    </div>
  </div>`;
}

function getCatBg(cat) {
  const bgs = { chips:'#1a1206', drinks:'#0d1a10', sweets:'#1a0e00', meals:'#1a0a00' };
  return bgs[cat] || '#1a1a1a';
}

function renderProductGrid(containerId, hotOnly) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let prods = APP.products.filter(p => p.inStock !== false);
  if (hotOnly) prods = prods.filter(p => p.isHot).slice(0, 4);
  if (APP.currentFilter !== 'all' && !hotOnly) prods = prods.filter(p => p.category === APP.currentFilter);
  if (prods.length === 0) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-state-icon">🕐</span><div class="empty-state-title">No snacks here yet</div><div class="empty-state-sub">Check back soon — the admin is adding products!</div></div>';
  } else {
    container.innerHTML = '<div class="products-grid">' + prods.map(productCardHTML).join('') + '</div>';
  }
}

function setFilter(cat, el) {
  APP.currentFilter = cat;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderProductGrid('shop-products', false);
}

function setFilterByKey(cat) {
  APP.currentFilter = cat;
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.remove('active');
    if (c.textContent.toLowerCase().includes(cat)) c.classList.add('active');
  });
  if (cat === 'all') document.querySelector('.filter-chip').classList.add('active');
}

function filterProducts(val) {
  const v = val.toLowerCase();
  const container = document.getElementById('shop-products');
  let prods = APP.products.filter(p => p.inStock !== false);
  if (APP.currentFilter !== 'all') prods = prods.filter(p => p.category === APP.currentFilter);
  if (v) prods = prods.filter(p => p.name.toLowerCase().includes(v) || (p.brand||'').toLowerCase().includes(v));
  container.innerHTML = prods.length ? '<div class="products-grid">' + prods.map(productCardHTML).join('') + '</div>'
    : '<div class="empty-state" style="grid-column:1/-1"><span class="empty-state-icon">🔍</span><div class="empty-state-title">No results</div></div>';
}

// ── CART ───────────────────────────────────────────────────
function addToCart(productId) {
  const prod = APP.products.find(p => p.id === productId);
  if (!prod) return;
  const ex = APP.cart.find(i => i.id === productId);
  if (ex) ex.qty++;
  else APP.cart.push({ ...prod, qty: 1 });
  updateCartBadge();
  const btn = document.getElementById('add-' + productId);
  if (btn) { btn.textContent = '✓'; btn.classList.add('added-flash'); setTimeout(() => { btn.textContent = '+'; btn.classList.remove('added-flash'); }, 700); }
}

function updateCartBadge() {
  const t = APP.cart.reduce((a, i) => a + i.qty, 0);
  const b = document.getElementById('cart-badge');
  b.textContent = t; b.classList.toggle('hidden', t === 0);
}

function getCartTotals() {
  const sub = APP.cart.reduce((a, i) => a + i.price * i.qty, 0);
  const delivery = sub >= 150 ? 0 : 20;
  const discount = APP.promoApplied ? Math.round(sub * 0.1) : 0;
  return { sub, delivery, discount, total: sub + delivery - discount };
}

function renderCart() {
  const list = document.getElementById('cart-items-list');
  const empty = document.getElementById('cart-empty');
  const full = document.getElementById('cart-full');
  const qty = APP.cart.reduce((a, i) => a + i.qty, 0);
  document.getElementById('cart-count-label').textContent = qty;
  if (!APP.cart.length) {
    list.innerHTML = ''; empty.style.display = 'flex'; empty.style.flexDirection = 'column'; empty.style.alignItems = 'center';
    full.style.display = 'none';
  } else {
    empty.style.display = 'none'; full.style.display = 'block';
    list.innerHTML = APP.cart.map((item, idx) => {
      const thumb = item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : item.emoji || '🍬';
      return `<div class="cart-item">
        <div class="cart-thumb">${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : `<span style="font-size:22px">${item.emoji||'🍬'}</span>`}</div>
        <div class="cart-item-info"><div class="cart-item-brand">${item.brand||''}</div><div class="cart-item-name">${item.name}</div></div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty(${idx},-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${idx},1)">+</button>
        </div>
        <div class="cart-item-price">R${item.price * item.qty}</div>
        <button class="remove-btn" onclick="removeFromCart(${idx})">×</button>
      </div>`;
    }).join('');
    updateCartSummary();
  }
}

function updateCartSummary() {
  const { sub, delivery, discount, total } = getCartTotals();
  document.getElementById('sum-sub').textContent = 'R' + sub;
  document.getElementById('sum-del').innerHTML = delivery === 0 ? '<span class="free-tag">FREE</span>' : 'R' + delivery;
  document.getElementById('delivery-note').innerHTML = delivery === 0 ? '<span style="color:var(--green)">✓ Free delivery applied</span>' : 'Add <b style="color:var(--orange)">R' + (150 - sub) + '</b> more for free delivery';
  document.getElementById('sum-disc-row').style.display = APP.promoApplied ? 'flex' : 'none';
  if (APP.promoApplied) document.getElementById('sum-disc').textContent = '-R' + discount;
  document.getElementById('sum-total').textContent = 'R' + total;
}

function changeQty(idx, delta) { APP.cart[idx].qty = Math.max(1, APP.cart[idx].qty + delta); updateCartBadge(); renderCart(); }
function removeFromCart(idx) { APP.cart.splice(idx, 1); updateCartBadge(); renderCart(); }
function applyPromo() {
  const val = document.getElementById('promo-input').value.trim().toUpperCase();
  if (['UCT10','STUDENT10','MUNCHIE10','FIRSTORDER'].includes(val) || val.endsWith('.AC.ZA')) {
    APP.promoApplied = true;
    document.getElementById('promo-ok').style.display = 'block';
    document.getElementById('promo-input').style.borderColor = 'var(--green)';
    updateCartSummary();
  } else {
    document.getElementById('promo-input').style.borderColor = 'var(--red)';
    setTimeout(() => document.getElementById('promo-input').style.borderColor = '', 1500);
  }
}

// ── CHECKOUT ───────────────────────────────────────────────
function setCampus(campus) {
  APP.currentCampus = campus;
  document.getElementById('campus-upper').classList.toggle('selected', campus === 'upper');
  document.getElementById('campus-middle').classList.toggle('selected', campus === 'middle');
  const sel = document.getElementById('res-select');
  sel.innerHTML = '<option value="">Select your residence</option>' + RESIDENCES[campus].map(r => `<option>${r}</option>`).join('');
}
function setTime(t) { document.getElementById('time-asap').classList.toggle('selected', t === 'asap'); document.getElementById('time-sched').classList.toggle('selected', t === 'sched'); }
function selectPay(el) { document.querySelectorAll('.pay-opt').forEach(e => e.classList.remove('selected')); el.classList.add('selected'); }
function renderCheckoutSummary() {
  const { sub, delivery, discount, total } = getCartTotals();
  const qty = APP.cart.reduce((a, i) => a + i.qty, 0);
  document.getElementById('co-items').textContent = qty + ' item' + (qty !== 1 ? 's' : '');
  document.getElementById('co-sub').textContent = 'R' + sub;
  document.getElementById('co-del').textContent = delivery === 0 ? 'Free' : 'R' + delivery;
  document.getElementById('co-disc-row').style.display = APP.promoApplied ? 'flex' : 'none';
  if (APP.promoApplied) document.getElementById('co-disc').textContent = '-R' + discount;
  document.getElementById('co-total').textContent = 'R' + total;
  setCampus('upper');
}
function placeOrder() {
  const n = Math.floor(1000 + Math.random() * 9000);
  APP.orderNum = '#MNC-' + n;
  const eta = new Date(); eta.setMinutes(eta.getMinutes() + 35); APP.etaTime = eta;

  // Persist order to Firestore
  if (db) {
    const { sub, delivery, discount, total } = getCartTotals();
    const residence = document.getElementById('res-select')?.value || '';
    db.collection('orders').add({
      orderNum: APP.orderNum,
      userId: APP.user?.uid || null,
      userEmail: APP.user?.email || '',
      userDisplayName: APP.user?.displayName || '',
      items: APP.cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, emoji: i.emoji || '', imageUrl: i.imageUrl || '' })),
      subtotal: sub, delivery, discount, total,
      campus: APP.currentCampus,
      residence,
      status: 'pending',
      eta: eta.toISOString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(err => console.warn('Order save failed:', err.message));
  }

  document.getElementById('confirm-order-num').textContent = APP.orderNum;
  document.getElementById('confirm-eta').textContent = eta.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  navigate('confirm');
}

// ── TRACKING ───────────────────────────────────────────────
let cdInterval;
function renderTracking() {
  if (APP.orderNum) document.getElementById('track-order-num').textContent = APP.orderNum;
  const now = new Date();
  document.getElementById('track-time').textContent = 'Placed ' + now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const eta = APP.etaTime || new Date(Date.now() + 35 * 60000);
  document.getElementById('t-eta-time').textContent = eta.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  if (cdInterval) clearInterval(cdInterval);
  let sec = Math.max(0, Math.floor((eta - new Date()) / 1000));
  const tick = () => { const m = Math.floor(sec / 60), s = sec % 60; document.getElementById('t-countdown').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); if (sec > 0) sec--; };
  tick(); cdInterval = setInterval(tick, 1000);
  const items = APP.cart.length > 0 ? APP.cart : [{ emoji: '🍜', name: 'Your snacks', price: 0, qty: 1 }];
  document.getElementById('tracking-items').innerHTML = items.map(i =>
    `<div class="ord-item"><div class="ord-thumb">${i.imageUrl ? `<img src="${i.imageUrl}" alt="${i.name}">` : `<span style="font-size:18px">${i.emoji||'🍬'}</span>`}</div><div class="ord-name">${i.name} × ${i.qty}</div><div class="ord-price">R${i.price * i.qty}</div></div>`
  ).join('') + `<div class="ord-item" style="background:var(--s2)"><span style="flex:1;font-size:12px;font-weight:700">Total paid</span><div class="ord-price">R${getCartTotals().total}</div></div>`;
}

// ── ADMIN PANEL ────────────────────────────────────────────
function setAdminTab(tab) {
  document.getElementById('atab-products').classList.toggle('active', tab === 'products');
  document.getElementById('atab-orders').classList.toggle('active', tab === 'orders');
  document.getElementById('admin-products-content').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('admin-orders-content').style.display = tab === 'orders' ? 'block' : 'none';
  if (tab === 'orders') { startOrdersListener(); renderAdminOrders(); }
}

function renderAdminPanel() {
  const prods = APP.products;
  document.getElementById('stat-total').textContent = prods.length;
  document.getElementById('stat-instock').textContent = prods.filter(p => p.inStock !== false).length;
  document.getElementById('stat-hot').textContent = prods.filter(p => p.isHot).length;
  if (!prods.length) {
    document.getElementById('admin-product-list').innerHTML = '<div class="empty-state"><span class="empty-state-icon">📦</span><div class="empty-state-title">No products yet</div><div class="empty-state-sub">Click "Add New Product" to add your first snack.</div></div>';
    return;
  }
  document.getElementById('admin-product-list').innerHTML = '<div class="admin-products-grid">' + prods.map(p => {
    const imgContent = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}">` : `<span style="font-size:36px">${p.emoji||'🍬'}</span>`;
    const bgStyle = p.imageUrl ? '' : `style="background:${getCatBg(p.category)}"`;
    return `<div class="admin-prod-card">
      <div class="admin-prod-img" ${bgStyle}>${imgContent}</div>
      <div class="admin-prod-info">
        <div class="admin-prod-brand">${p.brand||''}</div>
        <div class="admin-prod-name">${p.name}</div>
        <div class="admin-prod-price">R${p.price}</div>
      </div>
      <div class="admin-prod-controls">
        <button class="toggle-pill ${p.isHot?'on-hot':''}" onclick="toggleProductField('${p.id}','isHot',${!!p.isHot})">${p.isHot?'🔥 HOT':'HOT: off'}</button>
        <button class="toggle-pill ${p.inStock!==false?'on-stock':''}" onclick="toggleProductField('${p.id}','inStock',${p.inStock!==false})">${p.inStock!==false?'✓ IN STOCK':'OUT'}</button>
        <button class="admin-del-btn" onclick="deleteProduct('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function toggleProductField(id, field, currentVal) {
  db.collection('products').doc(id).update({ [field]: !currentVal })
    .catch(err => alert('Update failed: ' + err.message));
}

function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  db.collection('products').doc(id).delete()
    .catch(err => alert('Delete failed: ' + err.message));
}

// ── ADMIN ORDERS ───────────────────────────────────────────
let adminOrdersUnsub = null;
let APP_ORDERS_FILTER = 'all';
APP.orders = [];

const ORDER_STATUS_NEXT   = { pending:'confirmed', confirmed:'packing', packing:'delivering', delivering:'delivered', delivered:null };
const ORDER_STATUS_LABELS = { pending:'⏳ PENDING', confirmed:'✓ CONFIRMED', packing:'📦 PACKING', delivering:'🛵 DELIVERING', delivered:'✅ DELIVERED' };
const ORDER_STATUS_CSS    = { pending:'status-pending', confirmed:'status-confirmed', packing:'status-packing', delivering:'status-delivering', delivered:'status-delivered' };
const ORDER_NEXT_LABELS   = { pending:'Confirm', confirmed:'Start Packing', packing:'Out for Delivery', delivering:'Mark Delivered' };

function startOrdersListener() {
  if (adminOrdersUnsub) return; // already active
  adminOrdersUnsub = db.collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .onSnapshot(snapshot => {
      APP.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (currentScreen === 'admin') renderAdminOrders();
    }, err => console.error('Orders listener:', err));
}

function setOrdersFilter(filter, el) {
  APP_ORDERS_FILTER = filter;
  document.querySelectorAll('.orders-filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderAdminOrders();
}

function renderAdminOrders() {
  const allOrders = APP.orders || [];
  // Stats
  const delivered = allOrders.filter(o => o.status === 'delivered');
  const revenue   = delivered.reduce((a, o) => a + (o.total || 0), 0);
  const pending   = allOrders.filter(o => o.status !== 'delivered').length;
  document.getElementById('stat-orders').textContent = allOrders.length;
  document.getElementById('stat-revenue').textContent = 'R' + revenue;
  // Tab badge
  const tab = document.getElementById('atab-orders');
  tab.textContent = pending ? `Orders (${pending})` : 'Orders';

  let orders = allOrders;
  if (APP_ORDERS_FILTER !== 'all') orders = orders.filter(o => o.status === APP_ORDERS_FILTER);

  const container = document.getElementById('admin-order-list');
  if (!orders.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><div class="empty-state-title">${APP_ORDERS_FILTER !== 'all' ? 'No orders here' : 'No orders yet'}</div><div class="empty-state-sub">${APP_ORDERS_FILTER !== 'all' ? 'No orders with this status.' : 'Orders will appear here as customers place them.'}</div></div>`;
    return;
  }

  container.innerHTML = orders.map(o => {
    const t = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
    const timeStr = t.toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }) + ' · ' + t.toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
    const itemsList = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ') || 'No items';
    const next = ORDER_STATUS_NEXT[o.status];
    const campusLabel = o.campus === 'upper' ? '🏛 Upper' : '📚 Middle';
    return `<div class="order-card">
      <div class="order-card-header">
        <div><div class="order-num">${o.orderNum || '—'}</div><div class="order-time-small">${timeStr}</div></div>
        <span class="order-status-badge ${ORDER_STATUS_CSS[o.status] || ''}">${ORDER_STATUS_LABELS[o.status] || o.status}</span>
      </div>
      <div class="order-card-body">
        <div class="order-customer">👤 <b>${o.userDisplayName || o.userEmail || 'Guest'}</b> · ${campusLabel}${o.residence ? ' · ' + o.residence : ''}</div>
        <div class="order-items-preview">${itemsList}</div>
        <div class="order-card-footer">
          <div class="order-total-lbl">R${o.total || 0}</div>
          <div>
            ${next
              ? `<button class="order-action-btn" onclick="advanceOrder('${o.id}','${next}')">${ORDER_NEXT_LABELS[o.status]} →</button>`
              : `<span class="order-complete-tag">✅ COMPLETE</span>`}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function advanceOrder(orderId, newStatus) {
  db.collection('orders').doc(orderId).update({ status: newStatus })
    .catch(err => alert('Update failed: ' + err.message));
}

// ── ADD PRODUCT DRAWER ─────────────────────────────────────
function openDrawer() {
  document.getElementById('add-product-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('show');
  APP.pendingImageUrl = null;
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('upload-area').style.display = 'block';
  ['p-name','p-brand','p-emoji'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-category').value = '';
  document.getElementById('p-price').value = '';
  document.getElementById('p-hot').checked = false;
  document.getElementById('drawer-error').style.display = 'none';
  document.getElementById('save-product-btn').disabled = false;
  document.getElementById('save-product-btn').textContent = 'Save Product';
}

function closeDrawer() {
  document.getElementById('add-product-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('show');
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('upload-preview');
    preview.src = e.target.result; preview.style.display = 'block';
    document.getElementById('upload-area').style.display = 'none';
  };
  reader.readAsDataURL(file);
  uploadImageToStorage(file);
}

function uploadImageToStorage(file) {
  const spinner = document.getElementById('upload-spinner');
  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-progress-bar');
  spinner.style.display = 'block'; progressWrap.style.display = 'block';
  const ref = storage.ref('products/' + Date.now() + '_' + file.name);
  const task = ref.put(file);
  task.on('state_changed',
    snap => { const pct = (snap.bytesTransferred / snap.totalBytes) * 100; progressBar.style.width = pct + '%'; },
    err => { spinner.textContent = '❌ Upload failed: ' + err.message; APP.pendingImageUrl = null; },
    () => { task.snapshot.ref.getDownloadURL().then(url => { APP.pendingImageUrl = url; spinner.textContent = '✅ Image ready'; progressWrap.style.display = 'none'; }); }
  );
}

function saveProduct() {
  const name = document.getElementById('p-name').value.trim();
  const category = document.getElementById('p-category').value;
  const price = parseFloat(document.getElementById('p-price').value);
  const errEl = document.getElementById('drawer-error');
  if (!name || !category || !price || price < 1) {
    errEl.textContent = 'Please fill in Name, Category and Price.';
    errEl.style.display = 'block'; return;
  }
  const btn = document.getElementById('save-product-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const product = {
    name, category, price,
    brand: document.getElementById('p-brand').value.trim() || '',
    emoji: document.getElementById('p-emoji').value.trim() || getDefaultEmoji(category),
    imageUrl: APP.pendingImageUrl || '',
    isHot: document.getElementById('p-hot').checked,
    inStock: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  db.collection('products').add(product)
    .then(() => { closeDrawer(); APP.pendingImageUrl = null; })
    .catch(err => { errEl.textContent = 'Save failed: ' + err.message; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Save Product'; });
}

function getDefaultEmoji(cat) {
  return { chips:'🥔', drinks:'⚡', sweets:'🍫', meals:'🍜' }[cat] || '🍬';
}

// ── INIT ───────────────────────────────────────────────────
function initApp() {
  checkEmailLink();
  startProductListener();
  setCampus('upper');
  
  document.getElementById('admin-login-submit-btn').addEventListener('click', handleAdminLogin);
}

// ── BOOTSTRAP ─────────────────────────────────────────────
if (loadConfig()) {
  initFirebase();
  initApp();
} else {
  document.getElementById('setup-screen').style.display = 'flex';
  document.getElementById('top-nav').style.display = 'none';
  document.getElementById('marquee-bar').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  document.getElementById('home-screen').classList.remove('active');
}
</script>
