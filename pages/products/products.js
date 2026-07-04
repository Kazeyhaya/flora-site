const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortSelect = document.getElementById('sortSelect');
const productsGrid = document.getElementById('productsGrid');
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];
let products = [];
let activeBadge = 'todos';
let searchDebounce = null;
const categoryLabels = {
  maquiagem: 'Maquiagem',
  skincare: 'Skincare',
  kits: 'Kits e Combos',
  acessorios: 'Acessórios',
  perfumes: 'Perfumes',
  cabelos: 'Cabelos',
  clientes: 'Skincare',
  pedidos: 'Acessórios',
  entregas: 'Destaque',
  outros: 'Outros'
};

function clearAuthSession() {
  localStorage.removeItem('floraUser');
  localStorage.removeItem('floraCsrfToken');
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
}

async function fetchApiJson(path) {
  for (const baseUrl of API_BASE_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
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

function badgeCssClass(badge) {
  const map = { 'Novo': 'novo', 'Destaque': 'destaque', 'Promoção': 'promo' };
  return map[badge] || 'novo';
}

function renderProductCard(product) {
  const price = Number(product.price).toFixed(2).replace('.', ',');
  const promoPrice = product.preco_promo != null ? Number(product.preco_promo).toFixed(2).replace('.', ',') : null;
  const categoryLabel = categoryLabels[product.category] || 'Outros';
  const badgeHtml = product.badge
    ? `<span class="badge badge--${badgeCssClass(product.badge)}">${product.badge}</span>`
    : '';
  const priceHtml = promoPrice
    ? `<div class="price-wrap"><span class="price price--original">R$ ${price}</span><span class="price price--promo">R$ ${promoPrice}</span></div>`
    : `<div class="price">R$ ${price}</div>`;
  return `
    <article class="product-card${product.destaque ? ' product-card--destaque' : ''}">
      <div class="card-top">
        <span class="tag">${categoryLabel}</span>
        ${badgeHtml}
      </div>
      <div class="card-icon"><i class="${product.icon || 'fas fa-gem'}"></i></div>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      ${priceHtml}
    </article>
  `;
}

function renderProducts() {
  const term = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const sort = sortSelect ? sortSelect.value : 'relevancia';

  let filtered = products.filter((product) => {
    const matchesTerm = `${product.name} ${product.description}`.toLowerCase().includes(term);
    const matchesCategory = category === 'todos' || product.category === category;
    const matchesBadge = activeBadge === 'todos' || product.badge === activeBadge;
    return matchesTerm && matchesCategory && matchesBadge;
  });

  if (sort === 'preco_asc') {
    filtered.sort((a, b) => (a.preco_promo ?? a.price) - (b.preco_promo ?? b.price));
  } else if (sort === 'preco_desc') {
    filtered.sort((a, b) => (b.preco_promo ?? b.price) - (a.preco_promo ?? a.price));
  } else if (sort === 'nome_az') {
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } else if (sort === 'nome_za') {
    filtered.sort((a, b) => b.name.localeCompare(a.name, 'pt-BR'));
  }

  if (!filtered.length) {
    productsGrid.innerHTML = '<div class="empty-state">Nenhum produto encontrado.<br><small>Tente outra busca ou categoria.</small></div>';
    return;
  }

  productsGrid.innerHTML = filtered.map(renderProductCard).join('');
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

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(renderProducts, 300);
});
categoryFilter.addEventListener('change', renderProducts);
if (sortSelect) sortSelect.addEventListener('change', renderProducts);

document.getElementById('badgePills')?.addEventListener('click', (event) => {
  const pill = event.target.closest('.badge-pill');
  if (!pill) return;
  activeBadge = pill.dataset.badge;
  document.querySelectorAll('.badge-pill').forEach((p) => p.classList.remove('active'));
  pill.classList.add('active');
  renderProducts();
});

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const badge = params.get('badge');
  const category = params.get('category');
  if (badge) {
    activeBadge = badge;
    document.querySelectorAll('.badge-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.badge === badge);
    });
  }
  if (category && categoryFilter) {
    categoryFilter.value = category;
  }
}

updateAuthNav();
applyUrlParams();
loadProducts();
