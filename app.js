/* app.js
   Startup and navigation. Reads the address bar (#/shop/iphone, #/product/<id>, #/stores),
   asks api.js for data, asks views.js for HTML, and puts it on the page. */
(function () {
  "use strict";

  const main = document.getElementById("main");
  const BRAND = "Orbit";
  let token = 0;     // lets us ignore a slow response if the person has already moved on
  let current = null; // product page state: { product, sel }

  function setTitle(t) {
    document.title = t ? `${t} | ${BRAND}` : BRAND;
  }

  function markNav(section) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function show(html, title, fresh) {
    main.innerHTML = html;
    setTitle(title);
    if (fresh) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
  }

  async function route() {
    const t = ++token;
    current = null;
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const [section, arg] = parts;
    markNav(section === "stores" ? "stores" : section === "shop" || section === "product" ? "shop" : "");
    main.innerHTML = OrbitViews.loading();

    try {
      if (!section) {
        const [categories, products] = await Promise.all([OrbitApi.categories(), OrbitApi.products()]);
        if (t === token) show(OrbitViews.home({ categories, products }), "", true);
      } else if (section === "shop") {
        const [categories, products] = await Promise.all([OrbitApi.categories(), OrbitApi.products()]);
        const out = OrbitViews.shop({ categories, products }, arg || "");
        if (t !== token) return;
        out ? show(out.html, out.title, true) : show(OrbitViews.notFound(), "Page not found", true);
      } else if (section === "product" && arg) {
        const [categories, p] = await Promise.all([OrbitApi.categories(), OrbitApi.product(arg)]);
        if (t !== token) return;
        if (!p) return show(OrbitViews.notFound(), "Page not found", true);
        current = { product: p, categories, sel: { color: null, storage: null, img: 0 } };
        const out = OrbitViews.product(p, current.sel, categories);
        show(out.html, out.title, true);
      } else if (section === "stores") {
        const list = await OrbitApi.stores();
        if (t === token) show(OrbitViews.stores(list), "Stores", true);
      } else {
        show(OrbitViews.notFound(), "Page not found", true);
      }
    } catch (e) {
      if (t === token) show(OrbitViews.error(e.message), "", true);
    }
  }

  // Re-draw only the product page after a colour/storage/photo choice, and keep keyboard focus.
  function redrawProduct(focusSelector) {
    if (!current) return;
    const out = OrbitViews.product(current.product, current.sel, current.categories);
    show(out.html, out.title, false);
    if (focusSelector) {
      const el = main.querySelector(focusSelector);
      if (el) el.focus({ preventScroll: true });
    }
  }

  main.addEventListener("click", (e) => {
    const retry = e.target.closest("[data-retry]");
    if (retry) return route();

    const pick = e.target.closest("[data-kind]");
    if (pick && current) {
      current.sel[pick.dataset.kind] = pick.dataset.val;
      return redrawProduct(`[data-kind="${pick.dataset.kind}"][data-val="${CSS.escape(pick.dataset.val)}"]`);
    }

    const th = e.target.closest("[data-img]");
    if (th && current) {
      current.sel.img = Number(th.dataset.img);
      return redrawProduct(`[data-img="${th.dataset.img}"]`);
    }
  });

  window.addEventListener("hashchange", route);
  route();
})();
