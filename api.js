/* api.js
   The ONLY file that talks to Supabase. Screens never call the database directly.
   Money is stored in kobo (1 naira = 100 kobo); naira() converts for display. */
(function () {
  "use strict";

  const SUPABASE_URL = "https://hqfvnldpexjhdkboahhx.supabase.co";
  // Publishable key: safe in the browser because row-level security protects the data.
  const SUPABASE_KEY = "sb_publishable_uqt1NYiN7KakyNBKVpl4lA_ncqcnfSC";
  const BUCKET = "products";
  const CACHE_MS = 60 * 1000;

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const nairaFmt = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const naira = (kobo) => "\u20A6" + nairaFmt.format(kobo / 100);

  function friendly(err) {
    const msg = String((err && err.message) || err || "");
    if (!navigator.onLine || /failed to fetch|network|load failed/i.test(msg)) {
      return "Can't reach the shop. Check your internet connection and try again.";
    }
    return "This page didn't load. Please try again in a moment.";
  }

  async function run(query) {
    try {
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("[orbit api]", e);
      throw new Error(friendly(e));
    }
  }

  // Cache each list briefly so moving between screens is instant. Failures are never cached.
  const memo = {};
  function once(key, load) {
    const hit = memo[key];
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = load();
    memo[key] = { at: Date.now(), promise };
    promise.catch(() => { if (memo[key] && memo[key].promise === promise) delete memo[key]; });
    return promise;
  }

  function imageUrl(path) {
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Turn a raw database row into the shape the screens use.
  function shape(row) {
    const variants = (row.product_variants || [])
      .filter((v) => v.active !== false)
      .map((v) => ({
        id: v.id,
        color: v.color || "",
        storage: v.storage || "",
        priceKobo: v.price_kobo,
        stock: v.stock
      }))
      .sort((a, b) => a.priceKobo - b.priceKobo);

    const images = (row.product_images || [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((i) => imageUrl(i.path));

    const inStock = variants.filter((v) => v.stock > 0);
    const priced = (inStock.length ? inStock : variants).map((v) => v.priceKobo);
    const min = priced.length ? Math.min(...priced) : null;
    const max = priced.length ? Math.max(...priced) : null;

    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      categoryId: row.category_id,
      createdAt: row.created_at,
      images,
      variants,
      buyable: variants.length > 0,
      soldOut: variants.length > 0 && inStock.length === 0,
      fromKobo: min,
      varies: min !== max
    };
  }

  const PRODUCT_COLUMNS =
    "id,name,description,category_id,active,created_at," +
    "product_images(path,sort)," +
    "product_variants(id,color,storage,price_kobo,stock,active)";

  const api = {
    naira,
    imageUrl,

    categories() {
      return once("categories", () =>
        run(sb.from("categories").select("id,slug,name,sort").order("sort", { ascending: true }))
      );
    },

    // All active products, newest first. Includes products with no variants (check .buyable).
    products() {
      return once("products", async () => {
        const rows = await run(
          sb.from("products").select(PRODUCT_COLUMNS).eq("active", true).order("created_at", { ascending: false }).limit(500)
        );
        return rows.map(shape);
      });
    },

    async product(id) {
      const all = await api.products();
      return all.find((p) => p.id === id) || null;
    },

    stores() {
      return once("stores", () =>
        run(sb.from("stores").select("id,name,address,lat,lng,active").eq("active", true).order("name", { ascending: true }))
      );
    }
  };

  window.OrbitApi = api;
})();
