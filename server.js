require("dotenv").config();
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const bcrypt = require("bcryptjs");
const fs = require('fs');
const multer = require('multer');

const MenuItem = require("./models/MenuItem");
const Reservation = require("./models/Reservation");
const Order = require("./models/Order");
const User = require("./models/User");
const ContactMessage = require("./models/ContactMessage");

const app = express();

// Environment configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_fallback_secret';
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/oldrao';
const PORT = process.env.PORT || 3000;
// Optional debug flag to relax TLS in dev if corporate antivirus/proxy interferes
const MONGO_TLS_INSECURE = String(process.env.MONGO_TLS_INSECURE || '').toLowerCase() === 'true';
const mongoClientOptions = {};
if (MONGO_TLS_INSECURE) {
  mongoClientOptions.tlsAllowInvalidCertificates = true;
}

/* ---------------------------------------------
   TEMPLATE ENGINE
---------------------------------------------- */
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layout");
app.set("views", path.join(__dirname, "views"));

/* ---------------------------------------------
   STATIC FILES
---------------------------------------------- */
app.use(express.static("public"));
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'menu');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}

// Multer storage for menu images
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9-_]/gi, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage });

/* ---------------------------------------------
   BODY PARSER
---------------------------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------------------------------------
   DATABASE CONNECTION
---------------------------------------------- */
mongoose
  .connect(MONGO_URL, mongoClientOptions)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

/* ---------------------------------------------
   SESSION CONFIG
---------------------------------------------- */
// Initialize session store with error handler to avoid process crash on connection errors
const sessionStore = MongoStore.create({ mongoUrl: MONGO_URL, mongoOptions: mongoClientOptions });
sessionStore.on('error', (err) => {
  console.error('Session store error:', err);
});

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict'
    },
  })
);

// Make session available in all views (always define to avoid ReferenceError in EJS)
app.use((req, res, next) => {
  res.locals.session = req.session || {};
  next();
});

/* ---------------------------------------------
   ADMIN-ONLY BROWSING GUARD
   If a logged-in admin navigates to non-admin HTML pages, redirect to /admin
---------------------------------------------- */
app.use((req, res, next) => {
  try {
    const isAdmin = req.session?.user?.role === 'admin';
    if (!isAdmin) return next();

    const path = req.path || '';
    // Allow admin routes, logout, and SSE admin channel
    const allowed = path.startsWith('/admin') || path.startsWith('/events/admin') || path === '/logout';

    // Only redirect for primary page navigations (HTML)
    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    if (!allowed && acceptsHtml && req.method === 'GET') {
      return res.redirect('/admin');
    }
  } catch {}
  next();
});

/* ---------------------------------------------
   SERVER-SENT EVENTS (SSE) INFRA
---------------------------------------------- */
// In-memory client registries
const sseClients = {
  ordersById: new Map(), // orderId -> Set(res)
  admins: new Set(), // admin dashboards/details
};

function sseInit(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function sseSend(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseHeartbeat(res) {
  return setInterval(() => {
    res.write(`:keep-alive ${Date.now()}\n\n`);
  }, 25000);
}

function addOrderClient(orderId, res) {
  if (!sseClients.ordersById.has(orderId)) sseClients.ordersById.set(orderId, new Set());
  sseClients.ordersById.get(orderId).add(res);
}

function removeOrderClient(orderId, res) {
  const set = sseClients.ordersById.get(orderId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.ordersById.delete(orderId);
}

function broadcastOrder(orderId, event, payload) {
  const set = sseClients.ordersById.get(String(orderId));
  if (!set) return;
  for (const client of set) {
    sseSend(client, event, payload);
  }
}

function addAdminClient(res) { sseClients.admins.add(res); }
function removeAdminClient(res) { sseClients.admins.delete(res); }
function broadcastAdmins(event, payload) {
  for (const client of sseClients.admins) sseSend(client, event, payload);
}

// SSE endpoints
app.get('/events/order/:id', (req, res) => {
  const orderId = String(req.params.id);
  sseInit(res);
  const hb = sseHeartbeat(res);
  addOrderClient(orderId, res);
  sseSend(res, 'connected', { orderId });
  req.on('close', () => { clearInterval(hb); removeOrderClient(orderId, res); });
});

app.get('/events/admin/orders', (req, res) => {
  sseInit(res);
  const hb = sseHeartbeat(res);
  addAdminClient(res);
  sseSend(res, 'connected', { channel: 'admin-orders' });
  req.on('close', () => { clearInterval(hb); removeAdminClient(res); });
});

/* ---------------------------------------------
   ADMIN AUTH MIDDLEWARE
---------------------------------------------- */
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.send("Access Denied — Admins Only");
  }
  next();
}

/* ---------------------------------------------
   USER AUTH MIDDLEWARE
---------------------------------------------- */
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

/* ---------------------------------------------
   ROUTES — HOME
---------------------------------------------- */
app.get("/", (req, res) => {
  res.render("home");
});

/* ---------------------------------------------
   ROUTES — MENU
---------------------------------------------- */
app.get("/menu", (req, res) => {
  res.render("menu", { title: "Menu" });
});

// Info pages
app.get("/team", (req, res) => {
  res.render("team");
});

app.get("/faq", (req, res) => {
  res.render("faq");
});

app.get("/reviews", (req, res) => {
  res.render("reviews");
});

/* ---------------------------------------------
   CONTACT PAGE
---------------------------------------------- */
app.get("/contact", (req, res) => {
  const submitted = req.query.success === '1';
  res.render("contact", { submitted });
});

app.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).render("contact", { submitted: false, error: "Please fill all required fields." });
    }
    const created = await ContactMessage.create({ name, email, phone, message });
    // Notify admins of new contact message via SSE
    try {
      broadcastAdmins('new-contact', {
        id: created._id,
        name: created.name,
        email: created.email,
        createdAt: created.createdAt,
      });
    } catch {}
    res.redirect("/contact?success=1");
  } catch (err) {
    console.error(err);
    res.status(500).render("contact", { submitted: false, error: "We couldn't send your message. Please try again." });
  }
});

app.get("/api/menu", async (req, res) => {
  res.json(await MenuItem.find());
});

app.get("/api/menu/:id", async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Menu not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch menu item" });
  }
});

/* ---------------------------------------------
   ADMIN — MENU CRUD
---------------------------------------------- */
app.get("/admin/menu", requireAdmin, async (req, res) => {
  const menu = await MenuItem.find();
  res.render("adminMenu", { menu });
});

// Admin Dashboard
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [pendingOrders, preparingOrders, outForDelivery, reservations, contactsNew] = await Promise.all([
      Order.countDocuments({ status: 'Pending' }),
      Order.countDocuments({ status: 'Preparing' }),
      Order.countDocuments({ status: 'Out for Delivery' }),
      Reservation.countDocuments(),
      ContactMessage.countDocuments({ responded: false }),
    ]);
    const stats = { pendingOrders, preparingOrders, outForDelivery, reservations, contactsNew };
    res.render('admin', { stats });
  } catch (e) {
    res.render('admin', { stats: { pendingOrders: 0, preparingOrders: 0, outForDelivery: 0, reservations: 0, contactsNew: 0 } });
  }
});

/* ---------------------------------------------
   ADMIN — USER MANAGEMENT
---------------------------------------------- */
app.get("/admin/users", requireAdmin, async (req, res) => {
  const users = await User.find().sort({ role: -1, name: 1 });
  const selfId = String(req.session.user.id);
  const adminCount = await User.countDocuments({ role: 'admin' });
  res.render("adminUsers", { users, selfId, adminCount });
});

app.post("/admin/users/add", requireAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).send("All fields are required");
    if (await User.findOne({ email })) return res.status(400).send("User with this email already exists");
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashed, role: 'admin' });
    res.redirect('/admin/users');
  } catch (e) {
    res.status(500).send("Failed to add admin");
  }
});

app.post("/admin/users/promote/:id", requireAdmin, async (req, res) => {
  try { await User.findByIdAndUpdate(req.params.id, { role: 'admin' }); } catch {}
  res.redirect('/admin/users');
});

app.post("/admin/users/demote/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const selfId = String(req.session.user.id);
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (id === selfId) return res.status(400).send("You cannot demote yourself");
    if (adminCount <= 1) return res.status(400).send("At least one admin is required");
    await User.findByIdAndUpdate(id, { role: 'customer' });
  } catch {}
  res.redirect('/admin/users');
});

app.post("/admin/menu/add", requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, price, img, category } = req.body;
    const imgPath = req.file ? `/uploads/menu/${req.file.filename}` : (img || undefined);
    await MenuItem.create({ name, price, img: imgPath, category });
    res.redirect("/admin/menu");
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to add menu item');
  }
});

app.get("/admin/menu/delete/:id", requireAdmin, async (req, res) => {
  await MenuItem.findByIdAndDelete(req.params.id);
  res.redirect("/admin/menu");
});

app.get("/admin/menu/edit/:id", requireAdmin, async (req, res) => {
  res.render("adminEditMenu", {
    item: await MenuItem.findById(req.params.id),
  });
});

app.post("/admin/menu/edit/:id", requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const existing = await MenuItem.findById(req.params.id);
    if (!existing) return res.send('Not found');
    const { name, price, img, category } = req.body;
    let imgPath = existing.img;
    if (req.file) {
      imgPath = `/uploads/menu/${req.file.filename}`;
    } else if (img) {
      imgPath = img;
    }
    await MenuItem.findByIdAndUpdate(req.params.id, { name, price, img: imgPath, category });
    res.redirect("/admin/menu");
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to update menu item');
  }
});

/* ---------------------------------------------
   RESERVATION SYSTEM
---------------------------------------------- */
app.get("/reservation", (req, res) => {
  res.render("reservation");
});

app.post("/reservation", async (req, res) => {
  await Reservation.create(req.body);
  res.redirect("/reservation/success");
});

app.get("/reservation/success", (req, res) => {
  res.send("<h2>Reservation Successful!</h2><a href='/'>Back Home</a>");
});

/* --- ADMIN RESERVATIONS --- */
app.get("/admin/reservations", requireAdmin, async (req, res) => {
  const reservations = await Reservation.find().sort({ date: 1 });
  res.render("adminReservations", { reservations });
});

app.get("/admin/reservations/confirm/:id", requireAdmin, async (req, res) => {
  await Reservation.findByIdAndUpdate(req.params.id, { status: "Confirmed" });
  res.redirect("/admin/reservations");
});

app.get("/admin/reservations/complete/:id", requireAdmin, async (req, res) => {
  await Reservation.findByIdAndUpdate(req.params.id, { status: "Completed" });
  res.redirect("/admin/reservations");
});

app.get("/admin/reservations/cancel/:id", requireAdmin, async (req, res) => {
  await Reservation.findByIdAndUpdate(req.params.id, { status: "Cancelled" });
  res.redirect("/admin/reservations");
});

app.get("/admin/reservations/delete/:id", requireAdmin, async (req, res) => {
  await Reservation.findByIdAndDelete(req.params.id);
  res.redirect("/admin/reservations");
});

/* ---------------------------------------------
   ORDERS SYSTEM
---------------------------------------------- */
// Checkout Page
app.get("/checkout", requireLogin, (req, res) => {
  res.render("checkout");
});

// Place Order
app.post("/order", async (req, res) => {
  try {
    const created = await Order.create({
      items: req.body.items,
      total: req.body.total,
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      payment: req.body.payment,
      user: req.session.user?.id || null,
    });

    // Notify admins about new order
    broadcastAdmins('new-order', {
      id: created._id,
      total: created.total,
      name: created.name || 'Guest',
      createdAt: created.createdAt,
      status: created.status,
    });

    res.status(200).json({ message: "Order placed!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Order failed" });
  }
});

// Success Page
app.get("/order/success", (req, res) => {
  res.render("orderSuccess");
});

/* --- ADMIN ORDERS --- */
app.get("/admin/orders", requireAdmin, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.render("adminOrders", { orders });
});

app.get("/admin/orders/update/:id", requireAdmin, async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, { status: req.query.status });
  try {
    const updated = await Order.findById(req.params.id);
    if (updated) {
      // Broadcast to specific order subscribers (users)
      broadcastOrder(String(updated._id), 'status-update', { id: updated._id, status: updated.status });
      // Broadcast to admins dashboard
      broadcastAdmins('status-update', { id: updated._id, status: updated.status });
    }
  } catch {}
  res.redirect("/admin/orders");
});
// ADMIN ORDER DETAILS PAGE
app.get("/admin/orders/details/:id", requireAdmin, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) return res.send("Order not found");

  res.render("adminOrderDetails", { order });
});

/* --- ADMIN CONTACT MESSAGES --- */
app.get("/admin/contacts", requireAdmin, async (req, res) => {
  const messages = await ContactMessage.find().sort({ createdAt: -1 });
  res.render("adminContacts", { messages });
});

app.get("/admin/contacts/delete/:id", requireAdmin, async (req, res) => {
  try {
    await ContactMessage.findByIdAndDelete(req.params.id);
  } catch {}
  res.redirect("/admin/contacts");
});

app.get('/admin/contacts/respond/:id', requireAdmin, async (req, res) => {
  try {
    await ContactMessage.findByIdAndUpdate(req.params.id, { responded: true, respondedAt: new Date() });
  } catch {}
  res.redirect('/admin/contacts');
});

app.get('/admin/contacts/unrespond/:id', requireAdmin, async (req, res) => {
  try {
    await ContactMessage.findByIdAndUpdate(req.params.id, { responded: false, respondedAt: null });
  } catch {}
  res.redirect('/admin/contacts');
});

// Admin API to fetch a single contact message (used by SSE insert)
app.get('/api/contact/:id', requireAdmin, async (req, res) => {
  try {
    const msg = await ContactMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/admin/contacts/bulk', requireAdmin, async (req, res) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids provided' });
    if (!['respond','unrespond','delete'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    let result;
    if (action === 'respond') {
      result = await ContactMessage.updateMany({ _id: { $in: ids } }, { $set: { responded: true, respondedAt: new Date() } });
    } else if (action === 'unrespond') {
      result = await ContactMessage.updateMany({ _id: { $in: ids } }, { $set: { responded: false, respondedAt: null } });
    } else if (action === 'delete') {
      result = await ContactMessage.deleteMany({ _id: { $in: ids } });
    }
    res.json({ ok: true, action, ids });
  } catch (e) { res.status(500).json({ error: 'Bulk action failed' }); }
});

/* --- USER ORDER HISTORY --- */
app.get("/my-orders", requireLogin, async (req, res) => {
  const orders = await Order.find({ user: req.session.user.id }).sort({
    createdAt: -1,
  });
  res.render("orderHistory", { orders });
});

app.get("/order/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.send("Order not found");

    // Only show order if it belongs to the logged-in user OR admin
    if (order.user?.toString() !== String(req.session.user.id) && req.session.user.role !== "admin") {
      return res.send("Access denied!");
    }

    res.render("orderDetails", { order });
  } catch (err) {
    res.send("Invalid order ID");
  }
});

app.get("/api/order/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

/* ---------------------------------------------
   AUTH — SIGNUP
---------------------------------------------- */
app.get("/signup", (req, res) => res.render("signup"));

app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (await User.findOne({ email }))
    return res.send("User already exists!");

  await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 10),
  });

  res.redirect("/login");
});

/* ---------------------------------------------
   AUTH — LOGIN
---------------------------------------------- */
app.get("/login", (req, res) => res.render("login"));

app.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.send("User not found!");

  const match = await bcrypt.compare(req.body.password, user.password);
  if (!match) return res.send("Incorrect password!");

  req.session.user = {
    id: user._id,
    name: user.name,
    role: user.role,
  };

  // Send admins straight to the dashboard
  if (user.role === 'admin') return res.redirect('/admin');
  res.redirect("/");
});

/* ---------------------------------------------
   AUTH — LOGOUT
---------------------------------------------- */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ---------------------------------------------
PROFILE 
---------------------------------------------- */
app.get("/profile", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const orderCount = await Order.countDocuments({ user: req.session.user.id });
    res.render("profile", { user, orderCount });
  } catch (e) {
    res.render("profile", { user: { name: 'Unknown', email: '', role: 'customer' }, orderCount: 0 });
  }
});

app.post("/profile/update", requireLogin, async (req, res) => {
  const { name, phone } = req.body;
  try { await User.findByIdAndUpdate(req.session.user.id, { name, phone }); } catch {}
  res.redirect("/profile");
});

// latest order status 
app.get("/api/order-status/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.json({ error: "Not found" });
  res.json({ status: order.status });
});

/* ---------------------------------------------
   HEALTH CHECK
---------------------------------------------- */
app.get('/healthz', async (req, res) => {
  const states = ['disconnected','connected','connecting','disconnecting'];
  const mongoState = states[mongoose.connection.readyState] || String(mongoose.connection.readyState);
  const details = {
    uptime: process.uptime(),
    mongo: mongoState,
  };
  const ok = mongoState === 'connected';
  res.status(ok ? 200 : 503).json(details);
});


/* ---------------------------------------------
   404 / ERROR HANDLERS
---------------------------------------------- */
// 404 handler — keep last before error handler
app.use((req, res) => {
  res.status(404).render("404");
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("500");
});

/* ---------------------------------------------
   START SERVER
---------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
