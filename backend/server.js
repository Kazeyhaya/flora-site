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
const shouldUseLocalStore = Boolean(process.env.DB_PATH) || process.env.NODE_ENV === 'test';

if (!supabaseUrl || !supabaseKey) {
  if (!shouldUseLocalStore) {
    console.error('ERRO FATAL: Variáveis de ambiente do Supabase não configuradas.');
    process.exit(1);
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.warn('Usando datastore local para desenvolvimento/testes.');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || supabaseKey || 'flora-local-auth-secret';
const AUTH_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const AUTH_TOKEN_RENEW_THRESHOLD_SECONDS = 30 * 60;
const CSRF_TOKEN_TTL_SECONDS = AUTH_TOKEN_TTL_SECONDS;
const FRONTEND_ORIGINS = new Set(
  String(process.env.FRONTEND_ORIGIN || 'https://flora-website-roan.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const rateLimitStore = new Map();

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

// Catálogo de fallback (usado quando Supabase não está disponível)
const products = [
  { id: 1, name: 'Blush Bastão', category: 'maquiagem', price: 15.99, description: 'Pigmento cremoso · acabamento natural', icon: 'fas fa-palette', badge: 'Novo', destaque: true, preco_promo: null, imagem_url: null },
  { id: 2, name: 'Sérum Facial', category: 'skincare', price: 29.90, description: 'Hidratação profunda · antioxidante', icon: 'fas fa-flask', badge: 'Promoção', destaque: true, preco_promo: 19.90, imagem_url: null },
  { id: 3, name: 'Óleo Rosa Mosqueta', category: 'skincare', price: 19.90, description: 'Óleo regenerador · cicatrizante', icon: 'fas fa-oil-can', badge: null, destaque: false, preco_promo: null, imagem_url: null },
  { id: 4, name: 'Clarificante Facial', category: 'skincare', price: 22.50, description: 'Uniformiza o tom · luminosidade', icon: 'fas fa-star', badge: 'Destaque', destaque: true, preco_promo: null, imagem_url: null },
  { id: 5, name: 'Pure Mineral Blush', category: 'maquiagem', price: 18.90, description: 'Mineral · acabamento aveludado', icon: 'fas fa-gem', badge: 'Destaque', destaque: true, preco_promo: null, imagem_url: null },
  { id: 6, name: 'Prendedor de Pelúcia', category: 'acessorios', price: 12.00, description: 'Acessório fofo · para cabelo', icon: 'fas fa-paw', badge: 'Novo', destaque: false, preco_promo: null, imagem_url: null },
  { id: 7, name: 'Kit Rotina Completa', category: 'kits', price: 49.90, description: 'Sérum + hidratante + tônico · cuidado diário', icon: 'fas fa-box', badge: 'Promoção', destaque: true, preco_promo: 39.90, imagem_url: null },
  { id: 8, name: 'Hidratante Corporal', category: 'skincare', price: 24.90, description: 'Textura leve · fragrância suave', icon: 'fas fa-hand-sparkles', badge: 'Novo', destaque: false, preco_promo: null, imagem_url: null }
];

function createDefaultLocalState() {
  return {
    users: [],
    customers: [],
    orders: [],
    order_items: [],
    products: products.map((item) => ({ ...item, status: 'ativo' })),
    sequences: {
      users: 0,
      customers: 0,
      orders: 0,
      order_items: 0,
      products: products.length
    }
  };
}

function readLocalState(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return createDefaultLocalState();
    const rawContent = fs.readFileSync(filePath, 'utf8');
    if (!rawContent.trim()) return createDefaultLocalState();
    const parsed = JSON.parse(rawContent);
    return {
      ...createDefaultLocalState(),
      ...parsed,
      sequences: {
        ...createDefaultLocalState().sequences,
        ...(parsed.sequences || {})
      }
    };
  } catch (error) {
    return createDefaultLocalState();
  }
}

function writeLocalState(filePath, state) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function projectRecord(record, columns) {
  if (!columns || columns === '*' || columns.trim() === '*') return { ...record };
  return columns.split(',').map((entry) => entry.trim()).filter(Boolean).reduce((accumulator, column) => {
    accumulator[column] = record[column];
    return accumulator;
  }, {});
}

function nextLocalId(state, table) {
  const currentValue = Number(state.sequences?.[table] || 0);
  const nextValue = currentValue + 1;
  state.sequences = state.sequences || {};
  state.sequences[table] = nextValue;
  return nextValue;
}

class LocalQueryBuilder {
  constructor(store, table, mode = 'select') {
    this.store = store;
    this.table = table;
    this.mode = mode;
    this.columns = '*';
    this.options = {};
    this.filters = [];
    this.limitCount = null;
    this.insertPayload = null;
  }

  select(columns = '*', options = {}) {
    this.columns = columns;
    this.options = options || {};
    return this;
  }

  insert(payload) {
    this.mode = 'insert';
    this.insertPayload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this._execute();
  }

  maybeSingle() {
    return this._execute('maybeSingle');
  }

  single() {
    return this._execute('single');
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  _applyFilters(rows) {
    return this.filters.reduce((filteredRows, filter) => filteredRows.filter((row) => row?.[filter.column] === filter.value), rows);
  }

  _runSelect(state) {
    const rows = this._applyFilters(Array.isArray(state[this.table]) ? state[this.table] : []);
    const limitedRows = typeof this.limitCount === 'number' ? rows.slice(0, this.limitCount) : rows;
    if (this.options?.head && this.options?.count === 'exact') {
      return { data: null, count: rows.length, error: null };
    }
    return { data: limitedRows.map((row) => projectRecord(row, this.columns)), error: null };
  }

  _runInsert(state) {
    const payloadRows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
    const tableRows = Array.isArray(state[this.table]) ? state[this.table] : [];
    const insertedRows = payloadRows.map((row) => {
      const record = { ...row };
      if (record.id == null) {
        record.id = nextLocalId(state, this.table);
      }
      tableRows.push(record);
      return record;
    });
    state[this.table] = tableRows;
    return { data: insertedRows.map((row) => projectRecord(row, this.columns)), error: null };
  }

  _execute(singleMode) {
    return Promise.resolve().then(() => {
      const state = readLocalState(this.store.filePath);
      const result = this.mode === 'insert' ? this._runInsert(state) : this._runSelect(state);
      if (this.mode === 'insert') {
        writeLocalState(this.store.filePath, state);
      }

      if (singleMode === 'single') {
        if (!result.data || !result.data.length) return { data: null, error: new Error('Registro não encontrado') };
        return { data: result.data[0], error: null };
      }

      if (singleMode === 'maybeSingle') {
        return { data: result.data && result.data.length ? result.data[0] : null, error: null };
      }

      return result;
    });
  }
}

function createLocalDataSource(filePath) {
  const store = { filePath };
  if (!fs.existsSync(filePath)) {
    writeLocalState(filePath, createDefaultLocalState());
  }
  return {
    from(table) {
      return new LocalQueryBuilder(store, table);
    }
  };
}

const database = shouldUseLocalStore
  ? createLocalDataSource(process.env.DB_PATH || path.join(rootDir, 'backend', 'data', 'flora.local.json'))
  : supabase;

function setSecurityHeaders(res) {
  const request = res.req;
  const origin = request?.headers?.origin;
  const allowOrigin = origin && FRONTEND_ORIGINS.has(origin) ? origin : null;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  }
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

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) return cookies;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function getCookie(req, name) {
  return parseCookies(req.headers.cookie || '')[name] || null;
}

function isProductionCookieContext(req) {
  return process.env.NODE_ENV === 'production' || req?.headers?.['x-forwarded-proto'] === 'https';
}

function buildAuthCookie(token, req, maxAgeSeconds = AUTH_TOKEN_TTL_SECONDS) {
  const parts = [
    `flora_auth=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    `SameSite=${isProductionCookieContext(req) ? 'None' : 'Lax'}`
  ];
  if (isProductionCookieContext(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearAuthCookie(req) {
  const parts = [
    'flora_auth=;',
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    `SameSite=${isProductionCookieContext(req) ? 'None' : 'Lax'}`
  ];
  if (isProductionCookieContext(req)) parts.push('Secure');
  return parts.join('; ');
}

function buildCsrfCookie(token, req, maxAgeSeconds = CSRF_TOKEN_TTL_SECONDS) {
  const parts = [
    `flora_csrf=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${isProductionCookieContext(req) ? 'None' : 'Lax'}`
  ];
  if (isProductionCookieContext(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCsrfCookie(req) {
  const parts = [
    'flora_csrf=;',
    'Path=/',
    'Max-Age=0',
    `SameSite=${isProductionCookieContext(req) ? 'None' : 'Lax'}`
  ];
  if (isProductionCookieContext(req)) parts.push('Secure');
  return parts.join('; ');
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setSessionCookies(res, authToken, csrfToken, req) {
  res.setHeader('Set-Cookie', [
    buildAuthCookie(authToken, req),
    buildCsrfCookie(csrfToken, req)
  ]);
}

function clearSessionCookies(res) {
  const request = res.req;
  res.setHeader('Set-Cookie', [
    clearAuthCookie(request),
    clearCsrfCookie(request)
  ]);
}

function sendAuthCookie(res, token, req, maxAgeSeconds = AUTH_TOKEN_TTL_SECONDS) {
  res.setHeader('Set-Cookie', buildAuthCookie(token, req, maxAgeSeconds));
}

function clearAuthSession(res) {
  const request = res.req;
  res.setHeader('Set-Cookie', clearAuthCookie(request));
}

function getCsrfToken(req) {
  const headerToken = req.headers['x-csrf-token'];
  return typeof headerToken === 'string' ? headerToken.trim() : '';
}

function hasAuthenticatedContext(req) {
  return Boolean(getCookie(req, 'flora_auth') || extractBearerToken(req));
}

function requireCsrfProtection(req, onlyWhenAuthenticated = false) {
  if (onlyWhenAuthenticated && !hasAuthenticatedContext(req)) {
    return true;
  }
  const cookieToken = getCookie(req, 'flora_csrf');
  const headerToken = getCsrfToken(req);
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
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
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash) return false;

  // Compatibilidade com legado sha256 (pode ser removido após migração)
  if (!storedHash.startsWith('scrypt$')) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(storedHash));
  }

  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const computed = crypto.scryptSync(password, salt, 64).toString('hex');
  return computed.length === hash.length && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function createAuthToken(user) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name || user.nome,
    role: user.role || 'cliente',
    iat: now,
    exp: now + AUTH_TOKEN_TTL_SECONDS
  }));
  const signature = crypto
    .createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (expectedSig.length !== providedSig.length) return null;
  const isValidSig = crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig));
  if (!isValidSig) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp <= now) return null;
    return decoded;
  } catch (error) {
    return null;
  }
}

function tokenNeedsRenewal(payload) {
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now <= AUTH_TOKEN_RENEW_THRESHOLD_SECONDS;
}

async function getAuthenticatedSession(req) {
  const token = getCookie(req, 'flora_auth') || extractBearerToken(req);
  const payload = verifyAuthToken(token);
  if (!payload) return null;
  const user = await findUserById(payload.sub);
  if (!user) return null;
  return { token, payload, user };
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req, scope, maxAttempts, windowMs) {
  const key = `${scope}:${getClientIp(req)}`;
  const now = Date.now();
  const attempts = rateLimitStore.get(key) || [];
  const recent = attempts.filter((ts) => now - ts < windowMs);
  if (recent.length >= maxAttempts) {
    rateLimitStore.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimitStore.set(key, recent);
  return false;
}

async function findUserByEmail(email) {
  const { data, error } = await database
    .from('users')
    .select('id, nome, email, senha_hash, role')
    .eq('email', email)
    .limit(1);
  if (error) throw new Error('Erro ao consultar usuário');
  return data?.[0] || null;
}

async function findUserById(id) {
  const { data, error } = await database
    .from('users')
    .select('id, nome, email, role')
    .eq('id', id)
    .limit(1);
  if (error) throw new Error('Erro ao consultar usuário');
  return data?.[0] || null;
}

async function createUser(name, email, passwordHash) {
  const { data, error } = await database
    .from('users')
    .insert({ nome: name, email, senha_hash: passwordHash, role: 'cliente' })
    .select('id, nome, email')
    .single();
  if (error) throw new Error('Erro ao criar usuário');
  return { id: data.id, name: data.nome, email: data.email };
}

async function findCustomerByUserId(userId) {
  const { data, error } = await database
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Erro ao consultar cliente');
  return data || null;
}

async function createCustomer(userId, cpfCnpj, telefone, endereco) {
  const { data, error } = await database
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
  const { data, error } = await database
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
  const { data, error } = await database
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
    database.from('users').select('id', { count: 'exact', head: true }),
    database.from('orders').select('id', { count: 'exact', head: true }),
    database.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
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
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  // Responde rapidamente às requisições preflight do CORS
  if (req.method === 'OPTIONS') {
    setSecurityHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'flora-store-backend' });
    return;
  }

  if (pathname === '/api/products') {
    try {
      const { data, error } = await database
        .from('products')
        .select('id, nome, descricao, preco, categoria, status, badge, destaque, preco_promo, icone, imagem_url')
        .eq('status', 'ativo');
      if (error) throw error;

      const dbProducts = Array.isArray(data) ? data.map((item) => ({
        id: item.id,
        name: item.nome,
        description: item.descricao || '',
        price: Number(item.preco) || 0,
        category: item.categoria || 'outros',
        icon: item.icone || 'fas fa-gem',
        imageUrl: item.imagem_url || null,
        badge: item.badge || null,
        destaque: Boolean(item.destaque),
        preco_promo: item.preco_promo != null ? Number(item.preco_promo) : null
      })) : [];
      sendJson(res, 200, { products: dbProducts });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: 'Não foi possível carregar os produtos do banco de dados.' });
    }
    return;
  }

  if (pathname === '/api/auth/register') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido' });
    if (isRateLimited(req, 'register', 10, 10 * 60 * 1000)) {
      return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    try {
      const { name, email, password } = await readJsonBody(req);
      const validatedInput = validateRegistrationInput(name, email, password);
      if (await findUserByEmail(validatedInput.email)) {
        return sendJson(res, 409, { error: 'E-mail já cadastrado' });
      }
      const newUser = await createUser(validatedInput.name, validatedInput.email, hashPassword(validatedInput.password));
      const token = createAuthToken(newUser);
      const csrfToken = createCsrfToken();
      setSessionCookies(res, token, csrfToken, req);
      sendJson(res, 201, {
        message: 'Usuário cadastrado com sucesso',
        token,
        expiresIn: AUTH_TOKEN_TTL_SECONDS,
        csrfToken,
        user: newUser
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Erro ao cadastrar' });
    }
    return;
  }

  if (pathname === '/api/auth/login') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido' });
    if (isRateLimited(req, 'login', 12, 10 * 60 * 1000)) {
      return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    try {
      const { email, password } = await readJsonBody(req);
      const cleanEmail = normalizeEmail(email);
      const cleanPassword = typeof password === 'string' ? password.trim() : '';
      if (!cleanEmail || !cleanPassword) return sendJson(res, 400, { error: 'Informe e-mail e senha' });
      
      const user = await findUserByEmail(cleanEmail);
      const storedHash = user ? (user.senha_hash || user.password) : null;
      if (!user || !verifyPassword(cleanPassword, storedHash)) {
        return sendJson(res, 401, { error: 'Credenciais inválidas' });
      }

      const safeUser = { id: user.id, name: user.nome, email: user.email, role: user.role || 'cliente' };
      const token = createAuthToken(safeUser);
      const csrfToken = createCsrfToken();
      setSessionCookies(res, token, csrfToken, req);
      sendJson(res, 200, {
        message: 'Login realizado com sucesso',
        token,
        expiresIn: AUTH_TOKEN_TTL_SECONDS,
        csrfToken,
        user: safeUser
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Erro ao fazer login' });
    }
    return;
  }

  if (pathname === '/api/auth/me') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido' });
    try {
      const session = await getAuthenticatedSession(req);
      if (!session) return sendJson(res, 401, { error: 'Sessão inválida ou expirada' });

      const { payload, user } = session;
      const csrfToken = getCookie(req, 'flora_csrf') || createCsrfToken();
      if (tokenNeedsRenewal(payload)) {
        const renewedToken = createAuthToken({ id: user.id, name: user.nome, email: user.email, role: user.role || 'cliente' });
        setSessionCookies(res, renewedToken, csrfToken, req);
      } else if (!getCookie(req, 'flora_csrf')) {
        setSessionCookies(res, session.token, csrfToken, req);
      }

      sendJson(res, 200, {
        csrfToken,
        user: {
          id: user.id,
          name: user.nome,
          email: user.email,
          role: user.role || 'cliente'
        }
      });
    } catch (error) {
      sendJson(res, 401, { error: error.message || 'Não autorizado' });
    }
    return;
  }

  if (pathname === '/api/auth/logout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido' });
    if (!requireCsrfProtection(req, true)) {
      return sendJson(res, 403, { error: 'CSRF inválido ou ausente' });
    }
    clearSessionCookies(res);
    sendJson(res, 200, { message: 'Logout realizado com sucesso' });
    return;
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      if (isRateLimited(req, 'orders', 6, 10 * 60 * 1000)) {
        return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      if (!requireCsrfProtection(req, true)) {
        return sendJson(res, 403, { error: 'CSRF inválido ou ausente' });
      }
      const { customerName, customerEmail, total, status, formaPagamento, items, website, botTrap, honeypot } = await readJsonBody(req);
      const trapValue = sanitizeText(botTrap || website || honeypot);
      if (trapValue) {
        return sendJson(res, 400, { error: 'Requisição suspeita' });
      }
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

  if (pathname === '/api/admin/dashboard') {
    try {
      const session = await getAuthenticatedSession(req);
      if (!session) {
        return sendJson(res, 401, { error: 'Sessão inválida ou expirada' });
      }
      if ((session.user.role || 'cliente') !== 'admin') {
        return sendJson(res, 403, { error: 'Acesso restrito ao administrador' });
      }
      const dashboard = await getAdminDashboard();
      sendJson(res, 200, dashboard);
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Erro ao consultar painel administrativo' });
    }
    return;
  }

  const safePath = getSafeFilePath((req.url || '/') === '/' ? '/index.html' : req.url);
  if (!safePath) return sendJson(res, 404, { error: 'Arquivo não encontrado' });
  serveStatic(res, safePath);
});

server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});