const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function waitForServer(url, timeout = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const http = require('node:http');
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

test('registro e login de cliente funcionam', async () => {
  const dbPath = path.join(__dirname, 'fixtures-auth.db');
  fs.rmSync(dbPath, { force: true });

  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3101', DB_PATH: dbPath },
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
    await waitForServer('http://127.0.0.1:3101/api/health');

    const registerResponse = await fetch('http://127.0.0.1:3101/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', password: '123456' })
    });

    assert.equal(registerResponse.status, 201);
    const registerData = await registerResponse.json();
    assert.equal(registerData.user.email, 'ana@example.com');

    const loginResponse = await fetch('http://127.0.0.1:3101/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: '123456' })
    });

    assert.equal(loginResponse.status, 200);
    const loginData = await loginResponse.json();
    assert.equal(loginData.user.email, 'ana@example.com');
    assert.ok(loginData.token);
  } finally {
    server.kill('SIGTERM');
  }
});

test('caminhos com travessia de diretórios são bloqueados', async () => {
  const dbPath = path.join(__dirname, 'fixtures-path.db');
  fs.rmSync(dbPath, { force: true });

  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3103', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer('http://127.0.0.1:3103/api/health');

    await new Promise((resolve, reject) => {
      const req = require('node:http').request({
        hostname: '127.0.0.1',
        port: 3103,
        path: '/%2e%2e/backend/server.js',
        method: 'GET'
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          assert.equal(res.statusCode, 404);
          assert.match(body, /não encontrado|arquivo não encontrado/i);
          resolve();
        });
      });

      req.on('error', reject);
      req.end();
    });
  } finally {
    server.kill('SIGTERM');
  }
});
