const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const featuredProducts = document.getElementById('featuredProducts');
const currentYear = document.getElementById('currentYear');

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
    const response = await fetch('/api/products');
    const data = await response.json();
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
loadFeaturedProducts();
