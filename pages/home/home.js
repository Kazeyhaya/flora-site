const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const featuredProducts = document.getElementById('featuredProducts');
const currentYear = document.getElementById('currentYear');
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];

function getStoredUser() {
  try {
    const raw = localStorage.getItem('floraUser');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
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

async function loadFeaturedProducts() {
  try {
    const data = await fetchApiJson('/api/products');
    const items = Array.isArray(data.products) ? data.products.slice(0, 3) : [];
    if (!items.length) {
      featuredProducts.innerHTML = '<p>Não há produtos disponíveis no momento.</p>';
      return;
    }
    featuredProducts.innerHTML = items.map((product) => `
      <article class="product-card">
        <div class="product-icon"><i class="fas fa-gem"></i></div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</div>
      </article>
    `).join('');
  } catch (error) {
    featuredProducts.innerHTML = '<p>Não foi possível carregar os destaques.</p>';
  }
}

currentYear.textContent = new Date().getFullYear();
updateAuthNav();
loadFeaturedProducts();
