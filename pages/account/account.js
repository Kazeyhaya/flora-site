const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const logoutButton = document.getElementById('logoutButton');

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

const user = getStoredUser();
if (!user) {
  window.location.href = '../login/login.html';
} else {
  accountName.textContent = user.name || 'Cliente Flora';
  accountEmail.textContent = user.email || '-';
}

logoutButton.addEventListener('click', () => {
  localStorage.removeItem('floraUser');
  localStorage.removeItem('floraToken');
  window.location.href = '../home/home.html';
});

updateAuthNav();
