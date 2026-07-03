const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const productsGrid = document.getElementById('productsGrid');
let products = [];

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
      <span class="tag">${product.category}</span>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</div>
    </article>
  `).join('');
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
  } catch (error) {
    productsGrid.innerHTML = '<div class="empty-state">Não foi possível carregar os produtos.</div>';
  }
}

searchInput.addEventListener('input', renderProducts);
categoryFilter.addEventListener('change', renderProducts);
loadProducts();
