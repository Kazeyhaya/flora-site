const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    email: document.getElementById('loginEmail').value,
    password: document.getElementById('loginPassword').value
  };

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível entrar');
    loginMessage.textContent = 'Login realizado com sucesso.';
    loginMessage.style.color = '#2e7d32';
    loginForm.reset();
    window.location.href = '../products/products.html';
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.style.color = '#c76178';
  }
});
