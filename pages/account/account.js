const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const logoutButton = document.getElementById('logoutButton');
const REQUEST_TIMEOUT_MS = 8000;
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];

function clearAuthSession() {
  localStorage.removeItem('floraUser');
  localStorage.removeItem('floraToken');
  localStorage.removeItem('floraCsrfToken');
}

function getStoredCsrfToken() {
  return localStorage.getItem('floraCsrfToken') || '';
}

function getStoredToken() {
  return localStorage.getItem('floraToken') || '';
}

function setStoredCsrfToken(token) {
  if (typeof token === 'string' && token) {
    localStorage.setItem('floraCsrfToken', token);
  }
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

async function fetchCurrentUser() {
  const token = getStoredToken();
  for (const baseUrl of API_BASE_CANDIDATES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers,
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Sessão inválida');
      if (data.csrfToken) {
        setStoredCsrfToken(data.csrfToken);
      }
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
      const fallbackUser = getStoredUser();
      if (fallbackUser) {
        accountName.textContent = fallbackUser.name || 'Cliente Flora';
        accountEmail.textContent = fallbackUser.email || '-';
        return;
      }
      clearAuthSession();
      window.location.href = '../login/login.html';
    });
}

logoutButton.addEventListener('click', () => {
  const csrfToken = getStoredCsrfToken();
  fetch(`${API_BASE_CANDIDATES[0]}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
  }).catch(() => null).finally(() => {
    clearAuthSession();
    window.location.href = '../home/home.html';
  });
});

updateAuthNav();
