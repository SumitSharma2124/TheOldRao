// ========================
// MAIN.JS – REWRITTEN CLEAN VERSION
// ========================

document.addEventListener("DOMContentLoaded", () => {

  /* ============================================================
     UTIL: CART PERSISTENCE (sessionStorage)
     ============================================================ */

  function saveCart() {
    sessionStorage.setItem("oldraoCart", JSON.stringify(window.cart.items));
  }

  function loadCart() {
    try {
      let stored = sessionStorage.getItem("oldraoCart");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [];
  }


  /* ============================================================
     SHOPPING CART (OOP)
     ============================================================ */

  function ShoppingCart() {
    this.items = loadCart(); // restore cart
  }

  ShoppingCart.prototype.addItem = function (item) {
    let id = String(item._id || item.id);
    let existing = this.items.find(i => String(i.id) === id);

    if (existing) {
      existing.qty++;
    } else {
      this.items.push({
        id: id,
        name: item.name,
        price: item.price,
        img: item.img,
        qty: 1
      });
    }

    this.render();
    saveCart();
  };

  ShoppingCart.prototype.removeItem = function (id) {
    this.items = this.items.filter(i => String(i.id) !== String(id));
    this.render();
    saveCart();
  };

  ShoppingCart.prototype.getTotal = function () {
    return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  };

  ShoppingCart.prototype.render = function () {
    const container = document.getElementById("cartItems");
    if (!container) return;

    container.innerHTML = "";

    this.items.forEach(i => {
      container.innerHTML += `
        <div class="cart-item">
          <div>
            <strong>${i.name}</strong><br>
            Qty: ${i.qty}
          </div>
          <button class="cart-remove-btn" data-id="${i.id}">✕</button>
        </div>
      `;
    });

    // remove handlers
    document.querySelectorAll(".cart-remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        window.cart.removeItem(btn.dataset.id);
      });
    });

    // update total
    const totalEl = document.getElementById("cartTotal");
    if (totalEl) totalEl.textContent = this.getTotal();
  };


  // Global cart instance
  window.cart = new ShoppingCart();
  window.cart.render();



  /* ============================================================
     CART SIDEBAR TOGGLE
     ============================================================ */

  const cartBtn = document.getElementById("cartBtn");
  const cartSidebar = document.getElementById("cartSidebar");
  const closeCartBtn = document.getElementById("closeCart");

  cartBtn?.addEventListener("click", () => cartSidebar.classList.add("open"));
  closeCartBtn?.addEventListener("click", () => cartSidebar.classList.remove("open"));



  /* ============================================================
     LOAD MENU ITEMS FROM BACKEND
     ============================================================ */

  function loadMenu() {
    fetch("/api/menu")
      .then(res => res.json())
      .then(items => {
        window.menuItems = items;
        renderMenu("all");
      })
      .catch(err => console.error("Menu load failed", err));
  }

  function renderMenu(category) {
    const container = document.getElementById("menuContainer");
    if (!container || !window.menuItems) return;

    container.innerHTML = "";

    const filtered =
      category === "all"
        ? window.menuItems
        : window.menuItems.filter(i => i.category === category);

    filtered.forEach((item, i) => {
      container.innerHTML += `
        <div class="menu-item-card">
          <img src="${item.img}" alt="${item.name}">
          <div class="menu-title">${item.name}</div>
          <div class="menu-price">₹${item.price}</div>
          <button class="add-btn" data-id="${item._id}">Add to Cart</button>
        </div>
      `;
    });

    // Add-to-cart events
    document.querySelectorAll(".add-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        let id = btn.dataset.id;

        fetch(`/api/menu/${id}`)
          .then(res => res.json())
          .then(item => {
            window.cart.addItem(item);
            cartSidebar.classList.add("open");
          });
      });
    });
  }

  loadMenu();


  /* ============================================================
     MENU FILTER BUTTONS
     ============================================================ */

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      renderMenu(btn.dataset.category);
    });
  });



  /* ============================================================
     CHECKOUT PAGE LOGIC
     ============================================================ */

  if (window.location.pathname === "/checkout") {
    renderCheckout();

    function renderCheckout() {
      const container = document.getElementById("checkoutItems");
      if (!container) return;

      container.innerHTML = "";

      window.cart.items.forEach(i => {
        container.innerHTML += `
          <div class="price-row">
            <span>${i.name} (x${i.qty})</span>
            <span>₹${i.qty * i.price}</span>
          </div>
        `;
      });

      const subtotal = window.cart.getTotal();
      const delivery = 40;
      const tax = Math.round(subtotal * 0.05);

      document.getElementById("subtotal").textContent = subtotal;
      document.getElementById("delivery").textContent = delivery;
      document.getElementById("tax").textContent = tax;

      let tip = Number(document.querySelector(".tip-btn.active")?.dataset.tip || 0);
      document.getElementById("grandTotal").textContent =
        subtotal + delivery + tax + tip;
    }

    // Tip buttons
    document.querySelectorAll(".tip-btn")?.forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderCheckout();
      });
    });

    // Pay Now
    document.getElementById("payNowBtn")?.addEventListener("click", async () => {
      const orderData = {
        items: window.cart.items,
        total: Number(document.getElementById("grandTotal").textContent),
        name: document.getElementById("custName").value,
        phone: document.getElementById("custPhone").value,
        address: document.getElementById("custAddress").value,
        payment: document.getElementById("paymentMethod").value
      };

      const res = await fetch("/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });

      if (res.ok) {
        sessionStorage.removeItem("oldraoCart"); // clear cart
        window.location.href = "/order/success";
      } else alert("Order failed!");
    });
  }


  /* ============================================================
     USER DROPDOWN
     ============================================================ */

  document.getElementById("userBtn")?.addEventListener("click", e => {
    document.querySelector(".user-dropdown").classList.toggle("open");
    e.stopPropagation();
  });

  document.addEventListener("click", () => {
    document.querySelector(".user-dropdown")?.classList.remove("open");
  });

});


document.querySelectorAll(".reorder-btn")?.forEach(btn => {
  btn.addEventListener("click", async () => {
    const orderId = btn.dataset.orderid;

    const res = await fetch(`/api/order/${orderId}`);
    const oldOrder = await res.json();

    // Clear existing cart
    window.cart.items = [];

    // Refill cart
    oldOrder.items.forEach(i => window.cart.addItem(i));

    // Redirect user
    window.location.href = "/checkout";
  });
});


