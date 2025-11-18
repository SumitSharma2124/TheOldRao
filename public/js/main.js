// ========================
// MAIN.JS – REWRITTEN CLEAN VERSION
// ========================

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide icons if library loaded
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

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
  const cartOverlay = document.getElementById("cartOverlay");

  function openCart() {
    cartSidebar?.classList.add("open");
    cartOverlay?.classList.add("open");
  }
  function closeCart() {
    cartSidebar?.classList.remove("open");
    cartOverlay?.classList.remove("open");
  }

  cartBtn?.addEventListener("click", openCart);
  closeCartBtn?.addEventListener("click", closeCart);
  cartOverlay?.addEventListener("click", closeCart);



  /* ============================================================
     LOAD MENU ITEMS FROM BACKEND
     ============================================================ */

  function loadMenu() {
    const container = document.getElementById("menuContainer");
    if (container) container.innerHTML = `<div style="padding:16px; text-align:center; opacity:.7;">Loading menu…</div>`;
    fetch("/api/menu")
      .then(res => res.json())
      .then(items => {
        window.menuItems = items;
        renderMenu(currentCategory);
      })
      .catch(err => {
        console.error("Menu load failed", err);
        if (container) container.innerHTML = `<div style="padding:16px; text-align:center; opacity:.7;">Failed to load menu.</div>`;
      });
  }

  let currentCategory = "all";
  let currentQuery = "";
  let currentSort = "featured";

  function renderMenu(category) {
    const container = document.getElementById("menuContainer");
    if (!container || !window.menuItems) return;

    container.innerHTML = "";

    currentCategory = category || currentCategory;
    // filter by category
    let list = currentCategory === "all" ? [...window.menuItems] : window.menuItems.filter(i => i.category === currentCategory);
    // search filter
    if (currentQuery) {
      const q = currentQuery.toLowerCase();
      list = list.filter(i => (i.name||'').toLowerCase().includes(q));
    }
    // sort
    if (currentSort === 'price-asc') list.sort((a,b)=> (a.price||0)-(b.price||0));
    if (currentSort === 'price-desc') list.sort((a,b)=> (b.price||0)-(a.price||0));
    if (currentSort === 'name-asc') list.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')));

    list.forEach((item, i) => {
      container.innerHTML += `
        <div class="menu-item-card">
          <img src="${item.img}" alt="${item.name}" onerror="this.onerror=null;this.src='/images/placeholder.jpg'">
          <div class="menu-title">${item.name}</div>
          <div class="menu-footer">
            <div class="menu-price">₹${item.price}</div>
            <button class="add-btn" data-id="${item._id}">Add to Cart</button>
          </div>
        </div>
      `;
    });

    const countEl = document.getElementById('menuCount');
    if (countEl) countEl.textContent = `${list.length}/${window.menuItems.length}`;

    // Add-to-cart events
    document.querySelectorAll(".add-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        let id = btn.dataset.id;

        fetch(`/api/menu/${id}`)
          .then(res => res.json())
          .then(item => {
            window.cart.addItem(item);
            openCart();
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

  // search and sort controls
  const searchInput = document.getElementById('menuSearch');
  const sortSel = document.getElementById('menuSort');
  searchInput?.addEventListener('input', ()=>{ currentQuery = searchInput.value.trim(); renderMenu(); });
  sortSel?.addEventListener('change', ()=>{ currentSort = sortSel.value; renderMenu(); });



  /* ============================================================
     CHECKOUT PAGE LOGIC
     ============================================================ */

  if (window.location.pathname === "/checkout") {
    renderCheckout();

    function renderCheckout() {
      const container = document.getElementById("checkoutItems");
      if (!container) return;

      container.innerHTML = "";

      if (window.cart.items.length === 0) {
        container.innerHTML = `<div class="price-row" style="justify-content:center; color:#786b5e;">Your cart is empty.</div>`;
      } else {
        window.cart.items.forEach(i => {
          container.innerHTML += `
            <div class="price-row">
              <span>${i.name} (x${i.qty})</span>
              <span>₹${i.qty * i.price}</span>
            </div>
          `;
        });
      }

      const subtotal = window.cart.getTotal();
      const delivery = 40;
      const tax = Math.round(subtotal * 0.05);

      document.getElementById("subtotal").textContent = subtotal;
      document.getElementById("delivery").textContent = delivery;
      document.getElementById("tax").textContent = tax;

      let tip = Number(document.querySelector(".tip-btn.active")?.dataset.tip || 0);
      const grand = subtotal + delivery + tax + tip;
      const cardEl = document.getElementById("grandTotalCard");
      const stickyEl = document.getElementById("grandTotalSticky");
      if (cardEl) cardEl.textContent = grand;
      if (stickyEl) stickyEl.textContent = grand;

      // Enable/disable CTA depending on items
      const payBtn = document.getElementById("payNowBtn");
      if (payBtn) payBtn.disabled = window.cart.items.length === 0;
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
      // simple validation
      const name = document.getElementById("custName").value.trim();
      const phone = document.getElementById("custPhone").value.trim();
      const address = document.getElementById("custAddress").value.trim();
      if (!name || !phone || !address) {
        alert("Please fill in name, phone and address.");
        return;
      }

      const orderData = {
        items: window.cart.items,
        total: Number((document.getElementById("grandTotalSticky") || document.getElementById("grandTotalCard")).textContent),
        name,
        phone,
        address,
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

  /* ============================================================
     HOMEPAGE SLIDERS (Hero + Reviews)
     ============================================================ */
  // HERO SLIDER
  const hero = document.querySelector('.hero-slider');
  if (hero) {
    const slides = Array.from(hero.querySelectorAll('.slide'));
    const prevBtn = hero.querySelector('#prevSlide');
    const nextBtn = hero.querySelector('#nextSlide');
    const DOTS_CLASS = 'slider-dot';
    const DOTS_ACTIVE = 'active';
    let index = Math.max(0, slides.findIndex(s => s.classList.contains('active')));
    let timerId;

    // Create dots
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'slider-dots';
    slides.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = DOTS_CLASS;
      b.setAttribute('aria-label', `Go to slide ${i+1}`);
      b.addEventListener('click', () => { show(i); resetAuto(); });
      dotsWrap.appendChild(b);
    });
    hero.appendChild(dotsWrap);

    function updateDots(){
      const dots = dotsWrap.querySelectorAll('.' + DOTS_CLASS);
      dots.forEach((d, i) => d.classList.toggle(DOTS_ACTIVE, i === index));
    }

    function show(i){
      slides[index]?.classList.remove('active');
      index = (i + slides.length) % slides.length;
      slides[index]?.classList.add('active');
      updateDots();
    }
    function next(){ show(index + 1); }
    function prev(){ show(index - 1); }

    prevBtn?.addEventListener('click', () => { prev(); resetAuto(); });
    nextBtn?.addEventListener('click', () => { next(); resetAuto(); });

    function startAuto(){ timerId = setInterval(next, 5000); }
    function stopAuto(){ clearInterval(timerId); }
    function resetAuto(){ stopAuto(); startAuto(); }

    hero.addEventListener('mouseenter', stopAuto);
    hero.addEventListener('mouseleave', startAuto);

    updateDots();
    startAuto();
  }

  // REVIEWS SLIDER
  const reviewsWrap = document.querySelector('.reviews-slider');
  if (reviewsWrap) {
    const track = reviewsWrap.querySelector('.reviews-track');
    const slides = Array.from(reviewsWrap.querySelectorAll('.slide-review'));
    const prev = reviewsWrap.querySelector('.review-btn.left');
    const next = reviewsWrap.querySelector('.review-btn.right');
    let idx = Math.max(0, slides.findIndex(s => s.classList.contains('active')));
    let timer;

    function update(){
      slides.forEach((s,i)=> s.classList.toggle('active', i===idx));
      track.style.transform = `translateX(-${idx*100}%)`;
    }
    function go(n){ idx = (n + slides.length) % slides.length; update(); }
    function start(){ timer = setInterval(()=> go(idx+1), 6000); }
    function stop(){ clearInterval(timer); }
    function reset(){ stop(); start(); }

    prev?.addEventListener('click', ()=>{ go(idx-1); reset(); });
    next?.addEventListener('click', ()=>{ go(idx+1); reset(); });
    reviewsWrap.addEventListener('mouseenter', stop);
    reviewsWrap.addEventListener('mouseleave', start);

    // basic swipe for touch
    let sx = 0;
    track.addEventListener('touchstart', e=>{ sx = e.touches[0].clientX; stop(); });
    track.addEventListener('touchend', e=>{ const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx)>40) { if (dx<0) go(idx+1); else go(idx-1); } start(); });

    update();
    start();
  }

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
    // Toast + redirect
    showToast("Added past order to cart");
    setTimeout(() => { window.location.href = "/checkout"; }, 1000);
  });
});

// Lightweight toast helper
function ensureToastContainer(){
  let c = document.querySelector('.toast-container');
  if (!c){
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}
function showToast(message){
  const c = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'toast-message';
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.remove(); }, 1400);
}

// Order details: live updates via SSE
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("orderDetailsRoot");
  if (!root || !window.EventSource) return;
  const orderId = root.dataset.orderId;
  let lastStatus = root.dataset.status;
  const es = new EventSource(`/events/order/${orderId}`);
  es.addEventListener('status-update', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.status && data.status !== lastStatus) window.location.reload();
    } catch {}
  });
});

// Admin order details: live updates via SSE
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("adminOrderDetailsRoot");
  if (!root || !window.EventSource) return;
  const orderId = root.dataset.orderId;
  const es = new EventSource('/events/admin/orders');
  es.addEventListener('status-update', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (String(data.id) === String(orderId)) window.location.reload();
    } catch {}
  });

  // Keyboard shortcuts for quick status updates
  document.addEventListener("keydown", (e) => {
    const id = root.dataset.orderId;
    const base = `/admin/orders/update/${id}?status=`;
    if (e.key === '1') window.location.href = base + encodeURIComponent('Preparing');
    if (e.key === '2') window.location.href = base + encodeURIComponent('Out for Delivery');
    if (e.key === '3') window.location.href = base + encodeURIComponent('Completed');
    if (e.key.toLowerCase() === 'c') window.location.href = base + encodeURIComponent('Cancelled');
    if (e.key.toLowerCase() === 'p') window.print();
  });
  
  // Print button
  document.getElementById('printTicketBtn')?.addEventListener('click', () => window.print());
});


