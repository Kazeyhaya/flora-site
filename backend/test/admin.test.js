const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function waitForServer(url, timeout = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const http = require('node:http');
    const tryRequest = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeout) {
          reject(new Error('Servidor não iniciou a tempo'));
          return;
        }
        setTimeout(tryRequest, 100);
      });
    };

    tryRequest();
  });
}

function buildScryptHash(password, salt = '0123456789abcdef') {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

test('persistência de usuários e pedidos e painel administrativo funcionam', async () => {
  const dbPath = path.join(__dirname, 'fixtures-admin.db');
  fs.rmSync(dbPath, { force: true });
  fs.writeFileSync(dbPath, JSON.stringify({
    users: [
      {
        id: 1,
        nome: 'Admin Flora',
        email: 'admin@flora.com',
        senha_hash: buildScryptHash('123456'),
        role: 'admin'
      }
    ],
    customers: [],
    orders: [],
    order_items: [],
    products: [],
    sequences: {
      users: 1,
      customers: 0,
      orders: 0,
      order_items: 0,
      products: 0
    }
  }, null, 2));

  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3102', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  server.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer('http://127.0.0.1:3102/api/health');

    const blockedDashboard = await fetch('http://127.0.0.1:3102/api/admin/dashboard');
    assert.equal(blockedDashboard.status, 401);

    const registerResponse = await fetch('http://127.0.0.1:3102/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bia', email: 'bia@example.com', password: '123456' })
    });

    assert.equal(registerResponse.status, 201);

    const orderResponse = await fetch('http://127.0.0.1:3102/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Bia',
        customerEmail: 'bia@example.com',
        total: 35.5,
        status: 'pendente'
      })
    });

    assert.equal(orderResponse.status, 201);

    const loginResponse = await fetch('http://127.0.0.1:3102/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@flora.com', password: '123456' })
    });

    assert.equal(loginResponse.status, 200);
    const loginData = await loginResponse.json();

    const dashboardResponse = await fetch('http://127.0.0.1:3102/api/admin/dashboard', {
      headers: {
        Cookie: `flora_auth=${encodeURIComponent(loginData.token)}`
      }
    });

    assert.equal(dashboardResponse.status, 200);

    const dashboard = await dashboardResponse.json();
    assert.equal(dashboard.users, 2);
    assert.equal(dashboard.orders, 1);
    assert.equal(dashboard.pendingOrders, 1);
  } finally {
    server.kill('SIGTERM');
  }
});
