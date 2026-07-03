const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const logoutButton = document.getElementById('logoutButton');
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];

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

async function fetchCurrentUser() {
  const token = localStorage.getItem('floraToken');
  if (!token) throw new Error('Sessão ausente');

  for (const baseUrl of API_BASE_CANDIDATES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Sessão inválida');
      return data.user;
    } catch (error) {
      const isRecoverable = error.name === 'AbortError' || error instanceof TypeError;
      const isLast = baseUrl === API_BASE_CANDIDATES[API_BASE_CANDIDATES.length - 1];
      if (!isRecoverable || isLast) throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error('Sessão inválida');
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

  fetchCurrentUser()
    .then((serverUser) => {
      const safeUser = {
        name: serverUser?.name || user.name || 'Cliente Flora',
        email: serverUser?.email || user.email || '-'
      };
      localStorage.setItem('floraUser', JSON.stringify(safeUser));
      accountName.textContent = safeUser.name;
      accountEmail.textContent = safeUser.email;
    })
    .catch(() => {
      clearAuthSession();
      window.location.href = '../login/login.html';
    });
}

logoutButton.addEventListener('click', () => {
  clearAuthSession();
  window.location.href = '../home/home.html';
});

updateAuthNav();
