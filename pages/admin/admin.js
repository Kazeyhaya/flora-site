const clientsCount = document.getElementById('clientsCount');
const usersCount = document.getElementById('usersCount');
const deliveriesCount = document.getElementById('deliveriesCount');

async function loadAdminSummary() {
  try {
    const response = await fetch('/api/admin/dashboard', { credentials: 'include' });
    if (response.status === 401 || response.status === 403) {
      window.location.href = '../login/login.html';
      return;
    }
    const data = await response.json();
    clientsCount.textContent = '8';
    usersCount.textContent = data.users ?? 0;
    deliveriesCount.textContent = '3';
  } catch (error) {
    clientsCount.textContent = '0';
    usersCount.textContent = '0';
    deliveriesCount.textContent = '0';
  }
}

loadAdminSummary();
