require("dotenv").config();
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const bcrypt = require("bcryptjs");

const MenuItem = require("./models/MenuItem");
const Reservation = require("./models/Reservation");
const Order = require("./models/Order");
const User = require("./models/User");

const app = express();

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

/* ---------------------------------------------
   BODY PARSER
---------------------------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------------------------------------
   DATABASE CONNECTION
---------------------------------------------- */
mongoose
  .connect("mongodb://127.0.0.1:27017/oldrao", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

/* ---------------------------------------------
   SESSION CONFIG
---------------------------------------------- */
app.use(
  session({
    secret: "supersecretkey123",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: "mongodb://127.0.0.1:27017/oldrao",
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

// Make session available in all views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
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

app.post("/admin/menu/add", requireAdmin, async (req, res) => {
  await MenuItem.create(req.body);
  res.redirect("/admin/menu");
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

app.post("/admin/menu/edit/:id", requireAdmin, async (req, res) => {
  await MenuItem.findByIdAndUpdate(req.params.id, req.body);
  res.redirect("/admin/menu");
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
    await Order.create({
      items: req.body.items,
      total: req.body.total,
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      payment: req.body.payment,
      user: req.session.user?.id || "guest",
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
  res.redirect("/admin/orders");
});
// ADMIN ORDER DETAILS PAGE
app.get("/admin/orders/details/:id", requireAdmin, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) return res.send("Order not found");

  res.render("adminOrderDetails", { order });
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
    if (order.user !== String(req.session.user.id) && req.session.user.role !== "admin") {
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
app.get("/profile", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  User.findById(req.session.user.id).then(user => {
    res.render("profile", { user });
  });
});

app.post("/profile/update", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { name, phone } = req.body;

  await User.findByIdAndUpdate(req.session.user.id, { name, phone });

  res.redirect("/profile");
});

// latest order status 
app.get("/api/order-status/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.json({ error: "Not found" });
  res.json({ status: order.status });
});


/* ---------------------------------------------
   START SERVER
---------------------------------------------- */
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
