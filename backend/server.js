const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const port = process.env.PORT || 3000;
const rootDir = path.join(__dirname, '..');

// Conexão exclusiva com o Supabase
const supabaseUrl = process.env.SUPABASE_URL;
// Tenta pegar a Service Role Key primeiro, senão usa a normal
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO FATAL: Variáveis de ambiente do Supabase não configuradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const MAX_BODY_SIZE = 1024 * 1024;

// Produtos de fallback em memória (caso precise)
const products = [
  { id: 1, name: 'Blush bastão', category: 'kits', price: 15.99, description: 'Pigmento cremoso · acabamento natural', icon: 'fas fa-palette', color: '#fce4e4', textColor: '#d47a7a', badge: 'Novo' },
  { id: 2, name: 'Serum facial', category: 'kits', price: 15.99, description: 'Hidratação profunda · antioxidante', icon: 'fas fa-flask', color: '#e0f0e0', textColor: '#5a9a5a', badge: '+ Brinde' },
  { id: 3, name: 'Rosa Mosqueta', category: 'entregas', price: 19.9, description: 'Óleo regenerador · cicatrizante', icon: 'fas fa-oil-can', color: '#fce4d6', textColor: '#c97a4a' },
  { id: 4, name: 'Clarador', category: 'clientes', price: 22.5, description: 'Uniformiza o tom · luminosidade', icon: 'fas fa-star', color: '#e8e0f0', textColor: '#8a6aaa' },
  { id: 5, name: 'Pure Mineral Blush', category: 'clientes', price: 18.9, description: 'Mineral · acabamento aveludado', icon: 'fas fa-gem', color: '#f0e4d6', textColor: '#b88a6a' },
  { id: 6, name: 'Prendedor de Pelúcia', category: 'pedidos', price: 12, description: 'Acessório fofo · para cabelo', icon: 'fas fa-paw', color: '#f0e8e8', textColor: '#b08a8a' }
];

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  // Adicionando CORS para permitir que a Vercel acesse a API
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setSecurityHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, filePath) {
  setSecurityHeaders(res);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Corpo muito grande'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Corpo inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.replace(/[<>]/g, '').trim() : '';
}

function normalizeEmail(value) {
  return sanitizeText(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateRegistrationInput(name, email, password) {
  const cleanName = sanitizeText(name);
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = typeof password === 'string' ? password.trim() : '';
  if (cleanName.length < 2 || cleanName.length > 100) throw new Error('Nome deve ter entre 2 e 100 caracteres');
  if (!isValidEmail(cleanEmail)) throw new Error('E-mail inválido');
  if (cleanPassword.length < 6 || cleanPassword.length > 128) throw new Error('Senha deve ter entre 6 e 128 caracteres');
  return { name: cleanName, email: cleanEmail, password: cleanPassword };
}

function validateOrderInput(customerName, customerEmail, total, status, formaPagamento) {
  const cleanName = sanitizeText(customerName);
  const cleanEmail = normalizeEmail(customerEmail);
  const cleanStatus = sanitizeText(status || 'pendente');
  const cleanPayment = sanitizeText(formaPagamento || 'não informado');
  const numericTotal = Number(total);
  if (!cleanName || cleanName.length > 100) throw new Error('Nome do cliente inválido');
  if (!isValidEmail(cleanEmail)) throw new Error('E-mail do cliente inválido');
  if (!Number.isFinite(numericTotal) || numericTotal <= 0) throw new Error('Total inválido');
  if (!['pendente', 'aprovado', 'cancelado'].includes(cleanStatus.toLowerCase())) throw new Error('Status inválido');
  return {
    customerName: cleanName,
    customerEmail: cleanEmail,
    total: numericTotal,
    status: cleanStatus.toLowerCase(),
    formaPagamento: cleanPayment.slice(0, 50)
  };
}

function containsPathTraversal(requestUrl) {
  try {
    const rawPath = (requestUrl || '/').split('?')[0];
    const decodedPath = decodeURIComponent(rawPath);
    const normalizedPath = decodedPath.replace(/\\/g, '/');
    return normalizedPath.includes('/..') || normalizedPath === '..' || normalizedPath.startsWith('../') || normalizedPath.endsWith('/..') || rawPath.includes('%2e') || rawPath.includes('%2f') || rawPath.includes('%5c');
  } catch (error) {
    return true;
  }
}

function getSafeFilePath(requestUrl) {
  if (containsPathTraversal(requestUrl)) return null;
  try {
    const parsedUrl = new URL(requestUrl, 'http://localhost');
    const decodedPath = decodeURIComponent(parsedUrl.pathname || '/');
    const candidatePath = path.resolve(rootDir, `.${decodedPath}`);
    const rootPath = path.resolve(rootDir);
    if (candidatePath !== rootPath && !candidatePath.startsWith(rootPath + path.sep)) return null;
    return candidatePath;
  } catch (error) {
    return null;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id, nome, email, senha_hash, role')
    .eq('email', email)
    .limit(1);
  if (error) throw new Error('Erro ao consultar usuário');
  return data?.[0] || null;
}

async function createUser(name, email, passwordHash) {
  const { data, error } = await supabase
    .from('users')
    .insert({ nome: name, email, senha_hash: passwordHash, role: 'cliente' })
    .select('id, nome, email')
    .single();
  if (error) throw new Error('Erro ao criar usuário');
  return { id: data.id, name: data.nome, email: data.email };
}

async function findCustomerByUserId(userId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Erro ao consultar cliente');
  return data || null;
}

async function createCustomer(userId, cpfCnpj, telefone, endereco) {
  const { data, error } = await supabase
    .from('customers')
    .insert({ user_id: userId, cpf_cnpj: cpfCnpj, telefone, endereco })
    .select('id, user_id, cpf_cnpj, telefone, endereco')
    .single();
  if (error) throw new Error('Erro ao criar cliente');
  return data;
}

async function createOrderItem(orderId, item) {
  if (!item || !item.product_id || !Number.isFinite(Number(item.quantidade)) || Number(item.quantidade) <= 0 || !Number.isFinite(Number(item.valor_unitario))) {
    throw new Error('Item de pedido inválido');
  }
  const { data, error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      product_id: item.product_id,
      quantidade: Number(item.quantidade),
      valor_unitario: Number(item.valor_unitario)
    })
    .select('*')
    .single();
  if (error) throw new Error('Erro ao criar item do pedido');
  return data;
}

async function createOrder(customerName, customerEmail, total, status, formaPagamento = 'não informado', items = []) {
  let user = await findUserByEmail(customerEmail);
  if (!user) {
    const randomPassword = crypto.randomBytes(12).toString('hex');
    user = await createUser(customerName, customerEmail, hashPassword(randomPassword));
  }
  let customer = await findCustomerByUserId(user.id);
  if (!customer) {
    customer = await createCustomer(user.id, null, null, null);
  }
  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_id: customer.id,
      valor_total: total,
      status,
      forma_pagamento: formaPagamento
    })
    .select('*')
    .single();
  if (error) throw new Error('Erro ao criar pedido');
  if (Array.isArray(items) && items.length) {
    await Promise.all(items.map((item) => createOrderItem(data.id, item)));
  }
  return data;
}

async function getAdminDashboard() {
  const [usersRes, ordersRes, pendingRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
  ]);
  if (usersRes.error || ordersRes.error || pendingRes.error) {
    throw new Error('Erro ao consultar painel administrativo');
  }
  return {
    users: usersRes.count || 0,
    orders: ordersRes.count || 0,
    pendingOrders: pendingRes.count || 0
  };
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  // Responde rapidamente às requisições preflight do CORS
  if (req.method === 'OPTIONS') {
    setSecurityHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'flora-store-backend' });
    return;
  }

  if (url === '/api/products') {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, nome, descricao, preco, categoria, status')
        .eq('status', 'ativo');
      if (error) throw error;
      
      const dbProducts = Array.isArray(data) ? data.map((item) => ({
        id: item.id,
        name: item.nome,
        description: item.descricao || '',
        price: Number(item.preco) || 0,
        category: item.categoria || 'outros',
        icon: 'fas fa-gem',
        color: '#f0e4d6',
        textColor: '#b88a6a'
      })) : [];
      sendJson(res, 200, { products: dbProducts });
    } catch (error) {
      console.error(error);
      // Fallback para a lista estática caso o Supabase falhe ou tabela não exista
      sendJson(res, 200, { products });
    }
    return;
  }

  if (url === '/api/auth/register') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido' });
    try {
      const { name, email, password } = await readJsonBody(req);
      const validatedInput = validateRegistrationInput(name, email, password);
      if (await findUserByEmail(validatedInput.email)) {
        return sendJson(res, 409, { error: 'E-mail já cadastrado' });
      }
      const newUser = await createUser(validatedInput.name, validatedInput.email, hashPassword(validatedInput.password));
      sendJson(res, 201, { message: 'Usuário cadastrado com sucesso', user: newUser });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Erro ao cadastrar' });
    }
    return;
  }

  if (url === '/api/auth/login') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido' });
    try {
      const { email, password } = await readJsonBody(req);
      const cleanEmail = normalizeEmail(email);
      const cleanPassword = typeof password === 'string' ? password.trim() : '';
      if (!cleanEmail || !cleanPassword) return sendJson(res, 400, { error: 'Informe e-mail e senha' });
      
      const user = await findUserByEmail(cleanEmail);
      const storedHash = user ? (user.senha_hash || user.password) : null;
      if (!user || storedHash !== hashPassword(cleanPassword)) {
        return sendJson(res, 401, { error: 'Credenciais inválidas' });
      }
      const token = crypto.randomBytes(16).toString('hex');
      sendJson(res, 200, {
        message: 'Login realizado com sucesso',
        token,
        user: { id: user.id, name: user.name || user.nome, email: user.email }
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Erro ao fazer login' });
    }
    return;
  }

  if (url === '/api/orders' && req.method === 'POST') {
    try {
      const { customerName, customerEmail, total, status, formaPagamento, items } = await readJsonBody(req);
      const validatedOrder = validateOrderInput(customerName, customerEmail, total, status, formaPagamento);
      const order = await createOrder(
        validatedOrder.customerName,
        validatedOrder.customerEmail,
        validatedOrder.total,
        validatedOrder.status,
        validatedOrder.formaPagamento,
        Array.isArray(items) ? items : []
      );
      sendJson(res, 201, { message: 'Pedido criado com sucesso', order });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Erro ao criar pedido' });
    }
    return;
  }

  if (url === '/api/admin/dashboard') {
    try {
      const dashboard = await getAdminDashboard();
      sendJson(res, 200, dashboard);
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Erro ao consultar painel administrativo' });
    }
    return;
  }

  const safePath = getSafeFilePath(url === '/' ? '/index.html' : url);
  if (!safePath) return sendJson(res, 404, { error: 'Arquivo não encontrado' });
  serveStatic(res, safePath);
});

server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});