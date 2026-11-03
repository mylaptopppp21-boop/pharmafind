
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const supabase = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 32) {
  throw new Error('Set a strong JWT_SECRET in your environment variables.');
}

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim());

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const safeUser = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

const toUser = row => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  passwordHash: row.password_hash,
  createdAt: row.created_at
});

const toPharmacy = row => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
  address: row.address,
  city: row.city,
  phone: row.phone,
  description: row.description,
  verified: row.verified
});

const toInventory = row => ({
  id: row.id,
  pharmacyId: row.pharmacy_id,
  name: row.name,
  genericName: row.generic_name,
  category: row.category,
  form: row.form,
  price: Number(row.price),
  brand: row.brand,
  prescription: row.prescription,
  stock: row.stock,
  description: row.description
});

const toOrder = row => ({
  id: row.id,
  userId: row.user_id,
  pharmacyId: row.pharmacy_id,
  customerName: row.customer_name,
  address: row.address,
  phone: row.phone,
  items: row.items,
  total: Number(row.total),
  status: row.status,
  createdAt: row.created_at
});

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, key] = String(stored || '').split(':');
    if (!salt || !key || !/^[a-f0-9]{128}$/i.test(key)) return false;

    const test = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(test, Buffer.from(key, 'hex'));
  } catch {
    return false;
  }
}

function tokenFor(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    const parts = token.split('.');

    if (parts.length !== 2) throw new Error('Invalid token');

    const [payload, signature] = parts;
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(payload)
      .digest();

    const actual = Buffer.from(signature, 'base64url');

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) throw new Error('Invalid token');

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());

    if (!data.id || !data.role || data.exp < Date.now()) {
      throw new Error('Expired token');
    }

    req.user = data;
    next();
  } catch {
    res.status(401).json({ message: 'Please log in to continue' });
  }
}

const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'You do not have permission for this action' });

async function getPharmacyForOwner(ownerId) {
  const { data, error } = await supabase
    .from('pharmacies')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getInventoryForPharmacy(pharmacyId) {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('pharmacy_id', pharmacyId);

  if (error) throw error;
  return (data || []).map(toInventory);
}

async function getOrdersForPharmacy(pharmacyId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('pharmacy_id', pharmacyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toOrder);
}

// Health check
app.get('/api/health', asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('app_users')
    .select('id')
    .limit(1);

  if (error) {
    return res.status(503).json({
      status: 'error',
      service: 'PharmaFind API',
      database: 'unavailable'
    });
  }

  res.json({
    status: 'ok',
    service: 'PharmaFind API',
    database: 'supabase',
    timestamp: new Date().toISOString()
  });
}));

// Register
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const {
    name, email, password, role = 'customer',
    pharmacyName, address, phone
  } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({
      message: 'Name, email and password are required'
    });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters'
    });
  }

  if (!['customer', 'owner'].includes(role)) {
    return res.status(400).json({ message: 'Invalid account role' });
  }

  if (role === 'owner' && (!pharmacyName || !address)) {
    return res.status(400).json({
      message: 'Pharmacy name and address are required for owner accounts'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const { data: existing, error: findError } = await supabase
    .from('app_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    return res.status(409).json({
      message: 'An account with this email already exists'
    });
  }

  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    role,
    password_hash: hashPassword(password),
    created_at: new Date().toISOString()
  };

  const { error: userError } = await supabase
    .from('app_users')
    .insert(user);

  if (userError) {
    if (userError.code === '23505') {
      return res.status(409).json({
        message: 'An account with this email already exists'
      });
    }
    throw userError;
  }

  if (role === 'owner') {
    const { error: pharmacyError } = await supabase
      .from('pharmacies')
      .insert({
        id: crypto.randomUUID(),
        name: String(pharmacyName).trim(),
        owner_id: user.id,
        address: String(address).trim(),
        city: '',
        phone: phone || '',
        description: 'New pharmacy',
        verified: false
      });

    if (pharmacyError) {
      await supabase.from('app_users').delete().eq('id', user.id);
      throw pharmacyError;
    }
  }

  res.status(201).json({
    token: tokenFor(user),
    user: safeUser(user)
  });
}));

// Login
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};

  const { data: row, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', String(email || '').trim().toLowerCase())
    .maybeSingle();

  if (error) throw error;

  if (!row || !verifyPassword(password || '', row.password_hash)) {
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }

  const user = toUser(row);

  res.json({
    token: tokenFor(user),
    user: safeUser(user)
  });
}));

// Current user
app.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ message: 'Account not found' });

  res.json({ user: safeUser(toUser(data)) });
}));

// Search medicines
app.get('/api/medicines', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, pharmacies(*)');

  if (error) throw error;

  let items = (data || []).map(row => ({
    ...toInventory(row),
    pharmacy: row.pharmacies ? toPharmacy(row.pharmacies) : null
  })).filter(item => item.pharmacy);

  const q = String(req.query.q || '').toLowerCase();
  const category = String(req.query.category || '');
  const city = String(req.query.city || '').toLowerCase();

  if (q) {
    items = items.filter(item =>
      [
        item.name, item.genericName, item.brand,
        item.category, item.pharmacy.name,
        item.pharmacy.address
      ].join(' ').toLowerCase().includes(q)
    );
  }

  if (category) {
    items = items.filter(item => item.category === category);
  }

  if (city) {
    items = items.filter(item =>
      `${item.pharmacy.city} ${item.pharmacy.address}`
        .toLowerCase().includes(city)
    );
  }

  if (req.query.inStock === 'true') {
    items = items.filter(item => item.stock > 0);
  }

  const categories = [...new Set(
    (data || []).map(row => row.category).filter(Boolean)
  )].sort();

  res.json({ items, categories, count: items.length });
}));

// List pharmacies
app.get('/api/pharmacies', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('pharmacies')
    .select('*, inventory(id)');

  if (error) throw error;

  let items = (data || []).map(row => ({
    ...toPharmacy(row),
    medicineCount: row.inventory?.length || 0
  }));

  const q = String(req.query.q || '').toLowerCase();

  if (q) {
    items = items.filter(p =>
      `${p.name} ${p.address} ${p.city}`.toLowerCase().includes(q)
    );
  }

  res.json({ items });
}));

// Pharmacy details
app.get('/api/pharmacies/:id', asyncRoute(async (req, res) => {
  const { data: pharmacy, error } = await supabase
    .from('pharmacies')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw error;
  if (!pharmacy) {
    return res.status(404).json({ message: 'Pharmacy not found' });
  }

  res.json({
    ...toPharmacy(pharmacy),
    inventory: await getInventoryForPharmacy(pharmacy.id)
  });
}));

// Owner dashboard
app.get('/api/owner/overview', auth, allow('owner'), asyncRoute(async (req, res) => {
  const pharmacy = await getPharmacyForOwner(req.user.id);

  if (!pharmacy) {
    return res.status(404).json({ message: 'Pharmacy profile not found' });
  }

  const inventory = await getInventoryForPharmacy(pharmacy.id);
  const orders = await getOrdersForPharmacy(pharmacy.id);

  res.json({
    pharmacy: toPharmacy(pharmacy),
    inventory,
    orders,
    stats: {
      products: inventory.length,
      lowStock: inventory.filter(item => item.stock < 10).length,
      pendingOrders: orders.filter(order => order.status === 'Pending').length,
      totalOrders: orders.length
    }
  });
}));

// Add inventory item
app.post('/api/owner/inventory', auth, allow('owner'), asyncRoute(async (req, res) => {
  const pharmacy = await getPharmacyForOwner(req.user.id);

  if (!pharmacy) {
    return res.status(404).json({ message: 'Pharmacy not found' });
  }

  const {
    name, genericName, category, form, price, stock,
    brand, prescription, description
  } = req.body || {};

  if (
    !name || !category ||
    !Number.isFinite(Number(price)) || Number(price) < 0 ||
    !Number.isInteger(Number(stock)) || Number(stock) < 0
  ) {
    return res.status(400).json({
      message: 'Enter medicine name, category, valid price and stock'
    });
  }

  const record = {
    id: crypto.randomUUID(),
    pharmacy_id: pharmacy.id,
    name,
    generic_name: genericName || name,
    category,
    form: form || 'Tablet',
    price: Number(price),
    stock: Number(stock),
    brand: brand || 'Generic',
    prescription: Boolean(prescription),
    description: description || ''
  };

  const { data, error } = await supabase
    .from('inventory')
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  res.status(201).json(toInventory(data));
}));

// Update inventory item
app.put('/api/owner/inventory/:id', auth, allow('owner'), asyncRoute(async (req, res) => {
  const pharmacy = await getPharmacyForOwner(req.user.id);

  if (!pharmacy) {
    return res.status(404).json({ message: 'Pharmacy not found' });
  }

  const allowedFields = {
    name: 'name',
    genericName: 'generic_name',
    category: 'category',
    form: 'form',
    brand: 'brand',
    description: 'description',
    price: 'price',
    stock: 'stock',
    prescription: 'prescription'
  };

  const updates = {};

  for (const [input, column] of Object.entries(allowedFields)) {
    if (req.body[input] !== undefined) {
      if (['price', 'stock'].includes(input)) {
        const value = Number(req.body[input]);
        if (!Number.isFinite(value) || value < 0 ||
            (input === 'stock' && !Number.isInteger(value))) {
          return res.status(400).json({ message: `Invalid ${input}` });
        }
        updates[column] = value;
      } else {
        updates[column] = req.body[input];
      }
    }
  }

  const { data, error } = await supabase
    .from('inventory')
    .update(updates)
    .eq('id', req.params.id)
    .eq('pharmacy_id', pharmacy.id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return res.status(404).json({ message: 'Inventory item not found' });
  }

  res.json(toInventory(data));
}));

// Delete inventory item
app.delete('/api/owner/inventory/:id', auth, allow('owner'), asyncRoute(async (req, res) => {
  const pharmacy = await getPharmacyForOwner(req.user.id);

  if (!pharmacy) {
    return res.status(404).json({ message: 'Pharmacy not found' });
  }

  const { data, error } = await supabase
    .from('inventory')
    .delete()
    .eq('id', req.params.id)
    .eq('pharmacy_id', pharmacy.id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return res.status(404).json({ message: 'Inventory item not found' });
  }

  res.json({ message: 'Medicine removed from inventory' });
}));

// Place order
app.post('/api/orders', auth, allow('customer'), asyncRoute(async (req, res) => {
  const { items = [], customerName, address, phone } = req.body || {};

  if (!Array.isArray(items) || !items.length || !address || !phone) {
    return res.status(400).json({
      message: 'Cart, delivery address and phone are required'
    });
  }

  // Validate every requested item and group by pharmacy.
  const grouped = {};

  for (const line of items) {
    const quantity = Number(line.quantity);

    if (!line.inventoryId || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: 'Invalid cart item or quantity' });
    }

    const { data: item, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', line.inventoryId)
      .maybeSingle();

    if (error) throw error;

    if (!item || item.stock < quantity) {
      return res.status(400).json({
        message: `Insufficient stock or invalid item: ${item?.name || 'medicine'}`
      });
    }

    if (!grouped[item.pharmacy_id]) grouped[item.pharmacy_id] = [];
    grouped[item.pharmacy_id].push({ item, quantity });
  }

  const createdOrders = [];
  const stockChanges = [];

  try {
    for (const [pharmacyId, lines] of Object.entries(grouped)) {
      let total = 0;
      const orderItems = [];

      for (const { item, quantity } of lines) {
        const newStock = item.stock - quantity;

        // Conditional update prevents ordering more than the available stock.
        const { data: updated, error } = await supabase
          .from('inventory')
          .update({ stock: newStock })
          .eq('id', item.id)
          .eq('stock', item.stock)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!updated) throw new Error(`Stock changed for ${item.name}. Please try again.`);

        stockChanges.push({ id: item.id, oldStock: item.stock });

        total += Number(item.price) * quantity;
        orderItems.push({
          inventoryId: item.id,
          name: item.name,
          quantity,
          unitPrice: Number(item.price)
        });
      }

      const record = {
        id: 'PF-' + Date.now().toString(36).toUpperCase() +
          '-' + crypto.randomBytes(2).toString('hex').toUpperCase(),
        user_id: req.user.id,
        pharmacy_id: pharmacyId,
        customer_name: customerName || 'Customer',
        address,
        phone,
        items: orderItems,
        total,
        status: 'Pending',
        created_at: new Date().toISOString()
      };

      const { data: order, error } = await supabase
        .from('orders')
        .insert(record)
        .select()
        .single();

      if (error) throw error;
      createdOrders.push(toOrder(order));
    }
  } catch (error) {
    // Best-effort stock restoration if a later step fails.
    for (const change of stockChanges.reverse()) {
      await supabase
        .from('inventory')
        .update({ stock: change.oldStock })
        .eq('id', change.id);
    }
    throw error;
  }

  res.status(201).json({
    orders: createdOrders,
    message: 'Order placed successfully'
  });
}));

// List customer's orders or owner's pharmacy orders
app.get('/api/orders', auth, asyncRoute(async (req, res) => {
  let query = supabase.from('orders').select('*');

  if (req.user.role === 'owner') {
    const pharmacy = await getPharmacyForOwner(req.user.id);

    if (!pharmacy) return res.json({ items: [] });
    query = query.eq('pharmacy_id', pharmacy.id);
  } else {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  res.json({ items: (data || []).map(toOrder) });
}));

// Update order status
app.patch('/api/orders/:id/status', auth, allow('owner'), asyncRoute(async (req, res) => {
  const pharmacy = await getPharmacyForOwner(req.user.id);

  if (!pharmacy) {
    return res.status(404).json({ message: 'Pharmacy not found' });
  }

  const allowedStatuses = [
    'Confirmed', 'Ready for pickup', 'Completed', 'Cancelled'
  ];

  if (!allowedStatuses.includes(req.body.status)) {
    return res.status(400).json({ message: 'Invalid order status' });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: req.body.status })
    .eq('id', req.params.id)
    .eq('pharmacy_id', pharmacy.id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ message: 'Order not found' });

  res.json(toOrder(data));
}));

app.use((req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((err, req, res, next) => {
  console.error('API error:', err.message);
  res.status(500).json({ message: 'Server error. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`PharmaFind API running on port ${PORT}`);
});
