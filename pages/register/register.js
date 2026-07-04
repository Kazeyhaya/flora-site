const registerForm = document.getElementById('registerForm');
const registerMessage = document.getElementById('registerMessage');
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];
const REQUEST_TIMEOUT_MS = 8000;
let isSubmitting = false;

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

async function postJson(path, payload) {
  for (const baseUrl of API_BASE_CANDIDATES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
          signal: controller.signal,
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível cadastrar');
      return data;
    } catch (error) {
      const isRecoverable = error.name === 'AbortError' || error instanceof TypeError;
      const isLast = baseUrl === API_BASE_CANDIDATES[API_BASE_CANDIDATES.length - 1];
      if (!isRecoverable || isLast) {
        if (error.name === 'AbortError') {
          throw new Error('A requisição demorou demais. Tente novamente.');
        }
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error('Não foi possível cadastrar');
}

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const payload = {
    name: document.getElementById('registerName').value,
    email: document.getElementById('registerEmail').value,
    password: document.getElementById('registerPassword').value
  };

  const submitButton = registerForm.querySelector('button[type="submit"]');
  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Cadastrando...';

  try {
    const data = await postJson('/api/auth/register', payload);
    const user = data.user || { name: payload.name, email: payload.email };
    localStorage.setItem('floraUser', JSON.stringify(user));
    if (data.csrfToken) {
      localStorage.setItem('floraCsrfToken', data.csrfToken);
    }
    updateAuthNav();
    registerMessage.textContent = 'Cadastro realizado com sucesso.';
    registerMessage.style.color = '#2e7d32';
    registerForm.reset();
    setTimeout(() => {
      window.location.href = '../account/account.html';
    }, 500);
  } catch (error) {
    registerMessage.textContent = error.message;
    registerMessage.style.color = '#c76178';
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Cadastrar';
  }
});

updateAuthNav();
