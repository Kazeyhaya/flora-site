const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const featuredProducts = document.getElementById('featuredProducts');
const currentYear = document.getElementById('currentYear');
const heroAccountButton = document.getElementById('heroAccountButton');
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];

function clearAuthSession() {
  localStorage.removeItem('floraUser');
  localStorage.removeItem('floraToken');
  localStorage.removeItem('floraCsrfToken');
}

function getStoredToken() {
  return localStorage.getItem('floraToken') || '';
}

function getStoredUser() {
  try {
    const rawUser = localStorage.getItem('floraUser');
    if (!rawUser) {
      clearAuthSession();
      return null;
    }

    return JSON.parse(rawUser);
  } catch (error) {
    clearAuthSession();
    return null;
  }
}

function updateAuthNav() {
  const user = getStoredUser();
  document.querySelectorAll('[data-auth="guest"]').forEach((item) => {
    item.classList.toggle('is-hidden', Boolean(user));
  });
  document.querySelectorAll('[data-auth="user"]').forEach((item) => {
    item.classList.toggle('is-hidden', !user);
  });

  if (heroAccountButton) {
    heroAccountButton.textContent = user ? 'Minha Conta' : 'Entrar';
    heroAccountButton.href = user ? '../account/account.html' : '../login/login.html';
  }
}

async function fetchApiJson(path, extraHeaders = {}) {
  for (const baseUrl of API_BASE_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        credentials: 'include',
        headers: extraHeaders
      });
      if (!response.ok) continue;
      return await response.json();
    } catch (error) {
      // tenta a proxima base
    }
  }
  throw new Error('Falha ao consultar a API');
}

async function hydrateAuthState() {
  try {
    const token = getStoredToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const data = await fetchApiJson('/api/auth/me', headers);
    if (data?.user) {
      localStorage.setItem('floraUser', JSON.stringify(data.user));
      if (data.token) {
        localStorage.setItem('floraToken', data.token);
      }
      if (data.csrfToken) {
        localStorage.setItem('floraCsrfToken', data.csrfToken);
      }
    } else {
      clearAuthSession();
    }
  } catch (error) {
    if (!getStoredUser()) {
      clearAuthSession();
    }
  } finally {
    updateAuthNav();
  }
}

function toggleMenu(force) {
  const shouldOpen = typeof force === 'boolean' ? force : !navLinks.classList.contains('open');
  navLinks.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('menu-open', shouldOpen);
  menuToggle?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

menuToggle?.addEventListener('click', () => toggleMenu());
document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => toggleMenu(false));
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.nav-shell')) toggleMenu(false);
});

async function getAllProducts() {
  if (allProductsCache !== null) return allProductsCache;
  try {
    const data = await fetchApiJson('/api/products');
    allProductsCache = Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    allProductsCache = [];
  }
  return allProductsCache;
}

function badgeCssClass(badge) {
  const map = { 'Novo': 'novo', 'Destaque': 'destaque', 'Promoção': 'promo' };
  return map[badge] || 'novo';
}

function renderHomeProductCard(product) {
  const price = Number(product.price).toFixed(2).replace('.', ',');
  const promoPrice = product.preco_promo != null ? Number(product.preco_promo).toFixed(2).replace('.', ',') : null;
  const badgeHtml = product.badge
    ? `<span class="home-badge home-badge--${badgeCssClass(product.badge)}">${product.badge}</span>`
    : '';
  const priceHtml = promoPrice
    ? `<div class="price-wrap"><span class="price price--original">R$ ${price}</span><span class="price price--promo">R$ ${promoPrice}</span></div>`
    : `<div class="price">R$ ${price}</div>`;
  return `
    <article class="product-card">
      <div class="product-card-top">
        <div class="product-icon"><i class="${product.icon || 'fas fa-gem'}"></i></div>
        ${badgeHtml}
      </div>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      ${priceHtml}
    </article>
  `;
}

async function loadFeaturedProducts() {
  try {
    const prods = await getAllProducts();
    const items = prods.filter((p) => p.destaque).slice(0, 3);
    featuredProducts.innerHTML = items.length
      ? items.map(renderHomeProductCard).join('')
      : '<p>Nenhum produto em destaque no momento.</p>';
  } catch (error) {
    featuredProducts.innerHTML = '<p>Não foi possível carregar os destaques.</p>';
  }
}

async function loadNovidades() {
  const container = document.getElementById('novidadesGrid');
  if (!container) return;
  try {
    const prods = await getAllProducts();
    const items = prods.filter((p) => p.badge === 'Novo').slice(0, 3);
    container.innerHTML = items.length
      ? items.map(renderHomeProductCard).join('')
      : '<p class="empty-small">Em breve novas chegadas.</p>';
  } catch (error) {
    const el = document.getElementById('novidadesGrid');
    if (el) el.innerHTML = '<p class="empty-small">Não foi possível carregar.</p>';
  }
}

function initPromoBanner() {
  const banner = document.getElementById('promoBanner');
  const closeBtn = document.getElementById('promoBannerClose');
  if (!banner || !closeBtn) return;
  if (sessionStorage.getItem('promoBannerDismissed')) {
    banner.classList.add('is-hidden');
    return;
  }
  closeBtn.addEventListener('click', () => {
    banner.classList.add('is-hidden');
    sessionStorage.setItem('promoBannerDismissed', '1');
  });
}

currentYear.textContent = new Date().getFullYear();
updateAuthNav();
hydrateAuthState();
initPromoBanner();
loadFeaturedProducts();
loadNovidades();
