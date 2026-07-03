const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const searchToggle = document.getElementById('searchToggle');
const searchPanel = document.getElementById('searchPanel');
const searchInput = document.getElementById('productSearch');
const clearSearch = document.getElementById('clearSearch');
const catItems = document.querySelectorAll('.cat-item');
const productsGrid = document.getElementById('productsGrid');
const emptyState = document.getElementById('emptyState');
const cartBadge = document.querySelector('.icon-btn .badge');
const navbar = document.getElementById('navbar');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const registerMessage = document.getElementById('registerMessage');
const loginMessage = document.getElementById('loginMessage');
const usersCount = document.getElementById('usersCount');
const ordersCount = document.getElementById('ordersCount');
const pendingOrdersCount = document.getElementById('pendingOrdersCount');
let activeCategory = 'todos';
let cartCount = 3;
let products = [];

menuToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  const icon = menuToggle.querySelector('i');
  icon.classList.toggle('fa-bars');
  icon.classList.toggle('fa-times');
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    const icon = menuToggle.querySelector('i');
    icon.classList.add('fa-bars');
    icon.classList.remove('fa-times');
  });
});

searchToggle.addEventListener('click', () => {
  searchPanel.classList.toggle('active');
  if (searchPanel.classList.contains('active')) searchInput.focus();
});

clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  applyFilters();
});

searchInput.addEventListener('input', applyFilters);

document.addEventListener('click', (event) => {
  if (!event.target.closest('.nav-actions')) searchPanel.classList.remove('active');
});

function updateCartBadge() {
  cartBadge.textContent = cartCount;
  cartBadge.classList.add('pulse');
  setTimeout(() => cartBadge.classList.remove('pulse'), 250);
}

function formatPrice(price) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(price);
}

function renderProducts() {
  const term = searchInput.value.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'todos' || product.category === activeCategory;
    const searchableText = `${product.name} ${product.description}`.toLowerCase();
    const matchesSearch = !term || searchableText.includes(term);
    return matchesCategory && matchesSearch;
  });

  productsGrid.innerHTML = '';

  if (!filteredProducts.length) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  filteredProducts.forEach((product) => {
    const article = document.createElement('article');
    article.className = 'product-card';
    article.dataset.category = product.category;

    if (product.badge) {
      const badge = document.createElement('span');
      badge.className = 'badge-promo';
      badge.textContent = product.badge;
      article.appendChild(badge);
    }

    const image = document.createElement('div');
    image.className = 'product-image';
    image.style.background = product.color;
    image.style.color = product.textColor;

    const icon = document.createElement('i');
    icon.className = product.icon;
    image.appendChild(icon);
    article.appendChild(image);

    const title = document.createElement('h3');
    title.className = 'product-name';
    title.textContent = product.name;
    article.appendChild(title);

    const description = document.createElement('p');
    description.className = 'product-desc';
    description.textContent = product.description;
    article.appendChild(description);

    const price = document.createElement('div');
    price.className = 'product-price';
    price.textContent = formatPrice(product.price);
    article.appendChild(price);

    const button = document.createElement('button');
    button.className = 'btn-add';
    button.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
    article.appendChild(button);

    productsGrid.appendChild(article);
  });

  bindAddButtons();
}

function bindAddButtons() {
  document.querySelectorAll('.btn-add').forEach((btn) => {
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      const originalHtml = this.innerHTML;
      this.innerHTML = '<i class="fas fa-check"></i> Adicionado';
      this.style.background = 'var(--green)';
      this.style.borderColor = 'var(--green)';
      this.style.color = '#fff';
      cartCount += 1;
      updateCartBadge();
      setTimeout(() => {
        this.innerHTML = originalHtml;
        this.style.background = '';
        this.style.borderColor = '';
        this.style.color = '';
      }, 1800);
    });
  });
}

function applyFilters() {
  renderProducts();
}

catItems.forEach((item) => {
  item.addEventListener('click', () => {
    catItems.forEach((c) => c.classList.remove('active'));
    item.classList.add('active');
    activeCategory = item.dataset.category;
    applyFilters();
  });
});

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
  } catch (error) {
    emptyState.style.display = 'flex';
    emptyState.innerHTML = '<i class="fas fa-exclamation-circle"></i><strong>Não foi possível carregar os produtos</strong><span>Verifique o servidor e tente novamente.</span>';
  }
}

async function submitAuthForm(form, endpoint, messageEl, successMessage) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Falha na autenticação');
    }

    messageEl.textContent = successMessage;
    messageEl.style.color = 'var(--green)';
    form.reset();
    loadDashboard();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.style.color = 'var(--rose-dark)';
  }
}

async function loadDashboard() {
  try {
    const response = await fetch('/api/admin/dashboard');
    const data = await response.json();
    usersCount.textContent = data.users ?? 0;
    ordersCount.textContent = data.orders ?? 0;
    pendingOrdersCount.textContent = data.pendingOrders ?? 0;
  } catch (error) {
    usersCount.textContent = '0';
    ordersCount.textContent = '0';
    pendingOrdersCount.textContent = '0';
  }
}

registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuthForm(registerForm, '/api/auth/register', registerMessage, 'Conta criada com sucesso!');
});

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuthForm(loginForm, '/api/auth/login', loginMessage, 'Login realizado com sucesso!');
});

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

updateCartBadge();
loadProducts();
loadDashboard();
