const registerForm = document.getElementById('registerForm');
const registerMessage = document.getElementById('registerMessage');
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const API_BASE_CANDIDATES = ['https://backend-flora.onrender.com', ''];

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
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível cadastrar');
      return data;
    } catch (error) {
      if (baseUrl === API_BASE_CANDIDATES[API_BASE_CANDIDATES.length - 1]) {
        throw error;
      }
    }
  }
  throw new Error('Não foi possível cadastrar');
}

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: document.getElementById('registerName').value,
    email: document.getElementById('registerEmail').value,
    password: document.getElementById('registerPassword').value
  };

  try {
    await postJson('/api/auth/register', payload);
    registerMessage.textContent = 'Cadastro realizado com sucesso.';
    registerMessage.style.color = '#2e7d32';
    registerForm.reset();
    setTimeout(() => {
      window.location.href = '../login/login.html';
    }, 800);
  } catch (error) {
    registerMessage.textContent = error.message;
    registerMessage.style.color = '#c76178';
  }
});
