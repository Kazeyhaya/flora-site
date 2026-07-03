const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const productsGrid = document.getElementById('productsGrid');
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
let products = [];
const categoryLabels = {
  kits: 'Kits',
  clientes: 'Skincare',
  pedidos: 'Acessorios',
  entregas: 'Mais vendidos',
  outros: 'Outros'
};

function clearAuthSession() {
  localStorage.removeItem('floraUser');
  localStorage.removeItem('floraToken');
  localStorage.removeItem('floraSessionExpiresAt');
}

function getStoredUser() {
  try {
    const rawUser = localStorage.getItem('floraUser');
    const token = localStorage.getItem('floraToken');
    if (!rawUser || !token) {
      clearAuthSession();
      return null;
    }

    const expiresAtRaw = localStorage.getItem('floraSessionExpiresAt');
    const expiresAt = Number(expiresAtRaw);
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
      clearAuthSession();
      return null;
    }

    if (!Number.isFinite(expiresAt)) {
      localStorage.setItem('floraSessionExpiresAt', String(Date.now() + SESSION_DURATION_MS));
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
}

async function fetchApiJson(path) {
  for (const baseUrl of API_BASE_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) continue;
      return await response.json();
    } catch (error) {
      // tenta a proxima base
    }
  }
  throw new Error('Falha ao consultar a API');
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

function renderProducts() {
  const term = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const filtered = products.filter((product) => {
    const matchesTerm = `${product.name} ${product.description}`.toLowerCase().includes(term);
    const matchesCategory = category === 'todos' || product.category === category;
    return matchesTerm && matchesCategory;
  });

  if (!filtered.length) {
    productsGrid.innerHTML = '<div class="empty-state">Nenhum produto corresponde à busca.</div>';
    return;
  }

  productsGrid.innerHTML = filtered.map((product) => `
    <article class="product-card">
      <span class="tag">${categoryLabels[product.category] || 'Outros'}</span>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</div>
    </article>
  `).join('');
}

async function loadProducts() {
  try {
    const data = await fetchApiJson('/api/products');
    products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
  } catch (error) {
    productsGrid.innerHTML = '<div class="empty-state">Não foi possível carregar os produtos.</div>';
  }
}

searchInput.addEventListener('input', renderProducts);
categoryFilter.addEventListener('change', renderProducts);
updateAuthNav();
loadProducts();
