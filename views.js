/* views.js
   Screens. Each function takes data and returns an HTML string. No network calls here.
   Everything that comes from the database goes through esc() so it can never inject markup. */
(function () {
  "use strict";

  const N = (k) => OrbitApi.naira(k);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- small pieces ---------- */

  function media(p) {
    return p.images[0]
      ? `<img src="${esc(p.images[0])}" alt="" loading="lazy" decoding="async">`
      : `<span class="ph-letter" aria-hidden="true">${esc(p.name.trim().charAt(0).toUpperCase())}</span>`;
  }

  function priceText(p) {
    if (p.soldOut) return `<span class="tag">Sold out</span>`;
    return (p.varies ? "From " : "") + N(p.fromKobo);
  }

  function card(p) {
    return `<li><a class="card" href="#/product/${esc(p.id)}">
      <div class="media">${media(p)}</div>
      <h3>${esc(p.name)}</h3>
      <p class="price">${priceText(p)}</p>
    </a></li>`;
  }

  function grid(list) {
    return `<ul class="grid">${list.map(card).join("")}</ul>`;
  }

  function categoryChips(cats, prods, activeSlug) {
    const count = (c) => prods.filter((p) => p.categoryId === c.id).length;
    const chip = (href, label, on) =>
      `<a class="chip" href="${href}"${on ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
    return `<nav class="chips" aria-label="Categories">
      ${chip("#/shop", "All", !activeSlug)}
      ${cats.filter((c) => count(c) > 0).map((c) => chip("#/shop/" + esc(c.slug), c.name, c.slug === activeSlug)).join("")}
    </nav>`;
  }

  function emptyProducts() {
    return `<div class="note"><p><b>No products are listed yet.</b></p><p>New stock is added regularly. Please check back soon.</p></div>`;
  }

  /* ---------- states ---------- */

  function loading() {
    const sk = Array.from({ length: 6 }, () => `<li><div class="media skel"></div><div class="skel line"></div><div class="skel line short"></div></li>`).join("");
    return `<div role="status" aria-label="Loading"><div class="skel title"></div><ul class="grid">${sk}</ul></div>`;
  }

  function error(message) {
    return `<div class="note" role="alert"><p><b>${esc(message)}</b></p><p><button type="button" class="btn" data-retry>Try again</button></p></div>`;
  }

  function notFound() {
    return `<div class="note"><h1>Page not found</h1><p>That page doesn't exist or has been removed.</p><p><a class="btn" href="#/shop">Browse all products</a></p></div>`;
  }

  /* ---------- screens ---------- */

  function home(d) {
    const list = d.products.filter((p) => p.buyable);
    return `${categoryChips(d.categories, list, "")}
      <h1>New in</h1>
      ${list.length ? grid(list.slice(0, 8)) : emptyProducts()}
      ${list.length > 8 ? `<p class="more"><a class="btn ghost" href="#/shop">See all ${list.length} products</a></p>` : ""}`;
  }

  function shop(d, slug) {
    const cat = slug ? d.categories.find((c) => c.slug === slug) : null;
    if (slug && !cat) return null;
    const all = d.products.filter((p) => p.buyable);
    const list = cat ? all.filter((p) => p.categoryId === cat.id) : all;
    return {
      title: cat ? cat.name : "All products",
      html: `${categoryChips(d.categories, all, slug || "")}
        <h1>${esc(cat ? cat.name : "All products")}</h1>
        ${list.length ? grid(list) : `<div class="note"><p><b>Nothing in this category yet.</b></p><p><a href="#/shop">See all products</a></p></div>`}`
    };
  }

  // Works out which colour, storage and variant are selected. Updates sel so state stays valid.
  function resolve(p, sel) {
    const vs = p.variants;
    const colors = [...new Set(vs.map((v) => v.color))];
    const preferred = vs.find((v) => v.stock > 0) || vs[0];
    const color = colors.includes(sel.color) ? sel.color : preferred.color;
    const forColor = vs.filter((v) => v.color === color);
    const storages = [...new Set(forColor.map((v) => v.storage))];
    const pref2 = forColor.find((v) => v.stock > 0) || forColor[0];
    const storage = storages.includes(sel.storage) ? sel.storage : pref2.storage;
    const variant = forColor.find((v) => v.storage === storage);
    sel.color = color;
    sel.storage = storage;
    return { colors, storages, forColor, variant };
  }

  function stockLine(v) {
    if (v.stock <= 0) return `<span class="tag">Sold out</span>`;
    if (v.stock <= 5) return `<span class="low">Only ${v.stock} left</span>`;
    return `<span class="ok">In stock</span>`;
  }

  function optionGroup(label, kind, values, current, stockOf) {
    if (values.length === 1 && values[0] === "") return "";
    return `<fieldset class="opts"><legend>${esc(label)}</legend>
      ${values.map((v) => {
        const out = stockOf(v) <= 0;
        return `<button type="button" class="opt${out ? " out" : ""}" data-kind="${kind}" data-val="${esc(v)}" aria-pressed="${v === current}"${out ? ' aria-label="' + esc(v) + ', sold out"' : ""}>${esc(v)}</button>`;
      }).join("")}
    </fieldset>`;
  }

  function product(p, sel, cats) {
    if (!p) return null;
    if (!p.buyable) {
      return { title: p.name, html: `<div class="note"><h1>${esc(p.name)}</h1><p>This product is not available right now.</p><p><a class="btn" href="#/shop">Browse all products</a></p></div>` };
    }
    const r = resolve(p, sel);
    const v = r.variant;
    const cat = cats.find((c) => c.id === p.categoryId);
    const img = Math.min(sel.img || 0, Math.max(p.images.length - 1, 0));
    sel.img = img;

    const gallery = `<div class="gallery">
      <div class="media big">${p.images.length ? `<img src="${esc(p.images[img])}" alt="${esc(p.name)}" decoding="async">` : `<span class="ph-letter" aria-hidden="true">${esc(p.name.trim().charAt(0).toUpperCase())}</span>`}</div>
      ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((u, i) => `<button type="button" class="th" data-img="${i}" aria-label="Photo ${i + 1} of ${p.images.length}" aria-pressed="${i === img}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </div>`;

    const colorStock = (c) => Math.max(0, ...p.variants.filter((x) => x.color === c).map((x) => x.stock));
    const storageStock = (s) => (r.forColor.find((x) => x.storage === s) || { stock: 0 }).stock;

    return {
      title: p.name,
      html: `<p class="crumb"><a href="#/shop${cat ? "/" + esc(cat.slug) : ""}">Back to ${esc(cat ? cat.name : "all products")}</a></p>
        <div class="pd">
          ${gallery}
          <div class="info">
            <h1>${esc(p.name)}</h1>
            <p class="big-price">${N(v.priceKobo)}</p>
            ${optionGroup("Colour", "color", r.colors, sel.color, colorStock)}
            ${optionGroup("Storage", "storage", r.storages, sel.storage, storageStock)}
            <p class="stock" aria-live="polite">${stockLine(v)}</p>
            ${p.description ? `<div class="desc"><h2>About this product</h2><p>${esc(p.description)}</p></div>` : ""}
          </div>
        </div>`
    };
  }

  function stores(list) {
    if (!list.length) {
      return `<h1>Stores</h1><div class="note"><p><b>No store locations are listed yet.</b></p></div>`;
    }
    return `<h1>Stores</h1><ul class="stores">${list.map((s) => {
      const q = s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : `${s.name} ${s.address}`;
      return `<li class="store"><div><h2>${esc(s.name)}</h2><p>${esc(s.address)}</p></div>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}">Get directions</a></li>`;
    }).join("")}</ul>`;
  }

  window.OrbitViews = { loading, error, notFound, home, shop, product, stores };
})();
