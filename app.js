import { firebaseConfig, firebaseOptions } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const STORAGE_KEY = "casaMarketStoreV4Firebase";
const LEGACY_STORAGE_KEYS = [];
const CART_KEY = "casaMarketCartV3";
const LEGACY_CART_KEYS = [];
const SESSION_KEY = "casaMarketAdminLoggedV2";
const CUSTOMER_ID_KEY = "casaMarketCustomerId";
const FIREBASE_SETTINGS_COLLECTION = "settings";
const FIREBASE_SETTINGS_DOC = "main";
const FIREBASE_CATEGORIES_COLLECTION = "categories";
const FIREBASE_PRODUCTS_COLLECTION = "products";
const FIREBASE_ORDERS_COLLECTION = "orders";
const DEFAULT_MIN_ORDER_TOTAL = 15;
const DISCOUNT_CATEGORY_ID = "discounted-products";

const PAGE_MODE = document.body.dataset.page || "public";
const HAS_ADMIN_AREA = PAGE_MODE === "admin";

const ORDER_STATUSES = [
  "Ricevuto",
  "In preparazione",
  "Pronto per ritiro",
  "Consegnato",
  "Annullato"
];

const ADDRESS_TYPES = [
  "Casa / ufficio",
  "Mercato martedi",
  "Mercato mercoledi",
  "Mercato giovedi"
];
const DEFAULT_DESTINATION_MIN_ORDER_TOTALS = Object.fromEntries(ADDRESS_TYPES.map(type => [type, DEFAULT_MIN_ORDER_TOTAL]));

if (new URLSearchParams(window.location.search).has("reset")) {
  [...LEGACY_STORAGE_KEYS, STORAGE_KEY, CART_KEY, ...LEGACY_CART_KEYS, CUSTOMER_ID_KEY].forEach(key => localStorage.removeItem(key));
  sessionStorage.removeItem(SESSION_KEY);
}

const cloud = {
  enabled: isFirebaseConfigReady(firebaseConfig),
  app: null,
  auth: null,
  db: null,
  user: null,
  initialized: false,
  status: "offline",
  catalogSaveTimer: null,
  unsubscribeSettings: null,
  unsubscribeCategories: null,
  unsubscribeProducts: null,
  unsubscribeOrders: null,
  lastCategories: null,
  lastProducts: null,
  lastOrdersScope: "none"
};

const sampleImages = {
  electronics: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#173f35"/><stop offset="1" stop-color="#b84a26"/></linearGradient></defs><rect width="800" height="600" rx="44" fill="#f6f3ed"/><rect x="180" y="150" width="440" height="260" rx="36" fill="url(#g)" opacity=".9"/><circle cx="295" cy="282" r="58" fill="#fffaf2"/><rect x="390" y="236" width="160" height="96" rx="20" fill="#fffaf2" opacity=".9"/><text x="400" y="505" font-family="Arial" font-size="52" font-weight="700" fill="#173f35">Elettronica</text></svg>`),
  kitchen: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" rx="44" fill="#fffaf2"/><circle cx="315" cy="260" r="115" fill="#b84a26" opacity=".86"/><path d="M485 130c72 76 67 221-10 295" stroke="#173f35" stroke-width="54" stroke-linecap="round" fill="none"/><rect x="255" y="420" width="290" height="34" rx="17" fill="#173f35"/><text x="323" y="515" font-family="Arial" font-size="52" font-weight="700" fill="#173f35">Cucina</text></svg>`),
  home: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" rx="44" fill="#f6f3ed"/><path d="M178 300 400 130l222 170v190a30 30 0 0 1-30 30H208a30 30 0 0 1-30-30Z" fill="#173f35"/><rect x="332" y="365" width="136" height="155" rx="18" fill="#fffaf2"/><circle cx="444" cy="444" r="7" fill="#b84a26"/><text x="270" y="88" font-family="Arial" font-size="46" font-weight="700" fill="#b84a26">Casalinghi</text></svg>`),
  stationery: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" rx="44" fill="#fffaf2"/><rect x="190" y="130" width="420" height="330" rx="28" fill="#173f35" opacity=".92"/><path d="M260 210h280M260 280h230M260 350h280" stroke="#fffaf2" stroke-width="24" stroke-linecap="round"/><rect x="470" y="90" width="82" height="250" rx="28" fill="#b84a26" transform="rotate(18 511 215)"/><text x="272" y="535" font-family="Arial" font-size="52" font-weight="700" fill="#173f35">Cartoleria</text></svg>`)
};

function byId(id) {
  return document.getElementById(id);
}

function on(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

function isFirebaseConfigReady(config) {
  if (!config || typeof config !== "object") return false;
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every(key => {
    const value = String(config[key] || "").trim();
    return value && !value.includes("INSERISCI") && !value.includes("YOUR_") && !value.includes("...");
  });
}

function firebaseAdminEmails() {
  return Array.isArray(firebaseOptions?.adminEmails)
    ? firebaseOptions.adminEmails.map(email => String(email || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function adminCode() {
  return String.fromCharCode(76, 105, 110, 115, 111, 102, 105, 97, 50, 48, 49, 49);
}

function normalizeAdminCode(value) {
  return String(value || "").trim().replace(/[\s.]+$/g, "");
}

function getCustomerId() {
  let id = localStorage.getItem(CUSTOMER_ID_KEY);
  if (!id) {
    id = uid("customer");
    localStorage.setItem(CUSTOMER_ID_KEY, id);
  }
  return id;
}

function defaultStore() {
  const catElectronics = uid("cat");
  const catHome = uid("cat");
  const catKitchen = uid("cat");
  const catStationery = uid("cat");
  return {
    settings: {
      shopName: "Casa Market",
      subtitle: "Catalogo digitale del negozio",
      publicUrl: "",
      minOrderTotal: DEFAULT_MIN_ORDER_TOTAL,
      destinationMinOrderTotals: { ...DEFAULT_DESTINATION_MIN_ORDER_TOTALS },
      catalogNotice: "Ordine minimo 15 EUR. Scegli i prodotti, seleziona le opzioni disponibili e invia l'ordine con telefono, indirizzo e metodo di pagamento.",
      topMessage: "Nuovi arrivi e offerte disponibili in negozio."
    },
    categories: [
      { id: catElectronics, name: "Elettronica", order: 1 },
      { id: catHome, name: "Casalinghi", order: 2 },
      { id: catKitchen, name: "Cucina", order: 3 },
      { id: catStationery, name: "Cartoleria", order: 4 }
    ],
    products: [
      {
        id: uid("prod"),
        categoryId: catElectronics,
        name: "Caricatore USB multiplo",
        description: "Caricatore da banco con piu uscite USB, utile per casa e ufficio.",
        price: 8.9,
        variants: [
          { id: uid("var"), label: "Bianco", price: 8.9 },
          { id: uid("var"), label: "Nero", price: 8.9 }
        ],
        image: sampleImages.electronics,
        enabled: true,
        order: 1
      },
      {
        id: uid("prod"),
        categoryId: catElectronics,
        name: "Prolunga multiuso",
        description: "Prolunga compatta con prese multiple. Colore e metraggio variabili in negozio.",
        price: 6.5,
        variants: [
          { id: uid("var"), label: "1,5 metri", price: 6.5 },
          { id: uid("var"), label: "3 metri", price: 8.5 },
          { id: uid("var"), label: "5 metri", price: 11.9 }
        ],
        image: sampleImages.electronics,
        enabled: true,
        order: 2
      },
      {
        id: uid("prod"),
        categoryId: catHome,
        name: "Set contenitori trasparenti",
        description: "Contenitori impilabili per organizzare cucina, bagno o armadi.",
        price: 4.9,
        variants: [
          { id: uid("var"), label: "3 pezzi", price: 4.9 },
          { id: uid("var"), label: "5 pezzi", price: 6.9 }
        ],
        image: sampleImages.home,
        enabled: true,
        order: 1
      },
      {
        id: uid("prod"),
        categoryId: catHome,
        name: "Organizzatore bagno",
        description: "Mensolina leggera per shampoo, saponi e accessori quotidiani.",
        price: 5.9,
        variants: [],
        image: sampleImages.home,
        enabled: true,
        order: 2
      },
      {
        id: uid("prod"),
        categoryId: catKitchen,
        name: "Padella antiaderente",
        description: "Padella per uso domestico, disponibile in diverse misure.",
        price: 12.9,
        saleEnabled: true,
        salePrice: null,
        variants: [
          { id: uid("var"), label: "20 cm", price: 9.9, salePrice: 8.9 },
          { id: uid("var"), label: "24 cm", price: 12.9, salePrice: 10.9 },
          { id: uid("var"), label: "28 cm", price: 16.9, salePrice: 14.9 }
        ],
        image: sampleImages.kitchen,
        enabled: true,
        order: 1
      },
      {
        id: uid("prod"),
        categoryId: catKitchen,
        name: "Set mestoli silicone",
        description: "Accessori cucina resistenti e facili da pulire.",
        price: 7.9,
        variants: [
          { id: uid("var"), label: "Rosso", price: 7.9 },
          { id: uid("var"), label: "Nero", price: 7.9 },
          { id: uid("var"), label: "Set grande", price: 10.9 }
        ],
        image: sampleImages.kitchen,
        enabled: true,
        order: 2
      }
    ],
    orders: []
  };
}

function normalizeVariant(variant, index, basePrice) {
  const label = String(variant?.label || "").trim();
  if (!label) return null;
  const price = Number.parseFloat(variant?.price);
  return {
    id: variant?.id || uid("var"),
    label,
    price: Number.isFinite(price) ? price : basePrice,
    salePrice: parseOptionalPrice(variant?.salePrice),
    order: Number(variant?.order) || index + 1
  };
}

function migrateStore(parsed) {
  const fresh = defaultStore();
  if (!parsed || typeof parsed !== "object") return fresh;

  const settings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
  const fallbackMinOrderTotal = parseOptionalPrice(settings.minOrderTotal) ?? parseOptionalPrice(settings.minimumOrderTotal) ?? fresh.settings.minOrderTotal;
  const rawDestinationMinimums = settings.destinationMinOrderTotals || settings.destinationMinimums || {};
  const destinationMinOrderTotals = Object.fromEntries(ADDRESS_TYPES.map(type => [
    type,
    parseOptionalPrice(rawDestinationMinimums[type]) ?? fallbackMinOrderTotal
  ]));

  const migrated = {
    settings: {
      shopName: settings.shopName || fresh.settings.shopName,
      subtitle: settings.subtitle || fresh.settings.subtitle,
      publicUrl: settings.publicUrl || "",
      minOrderTotal: fallbackMinOrderTotal,
      destinationMinOrderTotals,
      catalogNotice: settings.catalogNotice !== undefined ? String(settings.catalogNotice || "") : fresh.settings.catalogNotice,
      topMessage: settings.topMessage !== undefined ? String(settings.topMessage || "") : fresh.settings.topMessage
    },
    categories: Array.isArray(parsed.categories) ? parsed.categories : fresh.categories,
    products: Array.isArray(parsed.products) ? parsed.products : fresh.products,
    orders: Array.isArray(parsed.orders) ? parsed.orders : []
  };

  migrated.categories.forEach((category, index) => {
    category.id = category.id || uid("cat");
    category.name = category.name || `Categoria ${index + 1}`;
    category.order = Number(category.order) || index + 1;
  });

  migrated.products.forEach((product, index) => {
    product.id = product.id || uid("prod");
    product.categoryId = product.categoryId || migrated.categories[0]?.id || "";
    product.name = product.name || `Prodotto ${index + 1}`;
    product.description = product.description || "";
    product.price = Number.parseFloat(product.price) || 0;
    product.saleEnabled = product.saleEnabled === true || product.onSale === true;
    product.salePrice = product.saleEnabled ? parseOptionalPrice(product.salePrice) : null;
    product.image = product.image || sampleImages.home;
    product.enabled = product.enabled !== false;
    product.order = Number(product.order) || index + 1;
    product.variants = Array.isArray(product.variants)
      ? product.variants.map((variant, variantIndex) => normalizeVariant(variant, variantIndex, product.price)).filter(Boolean)
      : [];
  });

  migrated.orders.forEach(order => {
    order.items = Array.isArray(order.items) ? order.items : [];
    order.customerAddressType = order.customerAddressType || "";
    order.customerAddress = order.customerAddress || "";
  });

  return migrated;
}

function loadStore() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (!raw) {
      const initialStore = defaultStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialStore));
      return initialStore;
    }
    const parsed = JSON.parse(raw);
    const migrated = migrateStore(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (error) {
    console.warn("Store non valido, uso dati demo", error);
    const fallback = defaultStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function persistStoreCache() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function saveStore() {
  persistStoreCache();
  if (cloud.enabled && HAS_ADMIN_AREA && adminCloudSessionReady()) {
    scheduleCatalogSync();
  }
}

function normalizeCartItem(item) {
  if (!item || !item.productId) return null;
  const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
  return {
    productId: item.productId,
    variantId: item.variantId || "",
    quantity
  };
}

function loadCart() {
  try {
    let raw = localStorage.getItem(CART_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_CART_KEYS) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeCartItem).filter(Boolean) : [];
  } catch (error) {
    console.warn("Carrello non valido", error);
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

let store = loadStore();
let cart = loadCart();
let activeCategoryId = "all";
let searchTerm = "";
let sortMode = "category";
let toastTimer = null;

const els = {
  shopName: byId("shopName"),
  shopSubtitle: byId("shopSubtitle"),
  topMessage: byId("topMessage"),
  catalogNotice: byId("catalogNotice"),
  openCategories: byId("openCategories"),
  closeCategories: byId("closeCategories"),
  categoryBackdrop: byId("categoryBackdrop"),
  categoryList: byId("categoryList"),
  productGrid: byId("productGrid"),
  emptyCatalog: byId("emptyCatalog"),
  activeCategoryTitle: byId("activeCategoryTitle"),
  searchInput: byId("searchInput"),
  sortSelect: byId("productSort"),
  productModal: byId("productDetailModal"),
  closeProductModal: byId("closeProductDetail"),
  productDetailContent: byId("productDetailBody"),
  openOrders: byId("openOrders"),
  closeOrders: byId("closeOrders"),
  ordersDrawer: byId("ordersDrawer"),
  drawerBackdrop: byId("drawerBackdrop"),
  cartBadge: byId("cartBadge"),
  cartItems: byId("cartItems"),
  cartTotal: byId("cartTotal"),
  checkoutForm: byId("checkoutForm"),
  customerName: byId("customerName"),
  customerContact: byId("customerContact"),
  customerAddressType: byId("customerAddressType"),
  customerAddressWrap: byId("customerAddressWrap"),
  customerAddress: byId("customerAddress"),
  customerPayment: byId("customerPayment"),
  customerNote: byId("customerNote"),
  minOrderNotice: byId("minOrderNotice"),
  submitOrderButton: byId("submitOrderButton"),
  myOrders: byId("myOrders"),
  adminShortcut: byId("adminShortcut"),
  adminModal: byId("adminModal"),
  closeAdmin: byId("closeAdmin"),
  adminLogin: byId("adminLogin"),
  adminPanel: byId("adminPanel"),
  adminLoginForm: byId("adminLoginForm"),
  adminPinInput: byId("adminPinInput"),
  adminEmailInput: byId("adminEmailInput"),
  adminPasswordInput: byId("adminPasswordInput"),
  firebaseLoginFields: byId("firebaseLoginFields"),
  firebaseLoginHint: byId("firebaseLoginHint"),
  firebaseStatus: byId("firebaseStatus"),
  firebaseStatusText: byId("firebaseStatusText"),
  seedFirebaseButton: byId("seedFirebaseButton"),
  adminLogout: byId("adminLogout"),
  settingsForm: byId("settingsForm"),
  settingShopName: byId("settingShopName"),
  settingSubtitle: byId("settingSubtitle"),
  settingMinOrderTotal: byId("settingMinOrderTotal"),
  settingCatalogNotice: byId("settingCatalogNotice"),
  settingTopMessage: byId("settingTopMessage"),
  categoryForm: byId("categoryForm"),
  categoryNameInput: byId("categoryNameInput"),
  adminCategoryList: byId("adminCategoryList"),
  productForm: byId("productForm"),
  editingProductId: byId("editingProductId"),
  productCategorySelect: byId("productCategorySelect"),
  productNameInput: byId("productNameInput"),
  productPriceInput: byId("productPriceInput"),
  productSaleEnabledInput: byId("productSaleEnabledInput"),
  productSalePriceInput: byId("productSalePriceInput"),
  productVariantsList: byId("productVariantsList"),
  addVariantRow: byId("addVariantRow"),
  productImageInput: byId("productImageInput"),
  productEnabledInput: byId("productEnabledInput"),
  productDescInput: byId("productDescInput"),
  resetProductForm: byId("resetProductForm"),
  adminProductFilter: byId("adminProductFilter"),
  adminProductList: byId("adminProductList"),
  adminOrdersList: byId("adminOrdersList"),
  clearCompletedOrders: byId("clearCompletedOrders"),
  qrForm: byId("qrForm"),
  qrUrlInput: byId("qrUrlInput"),
  qrPlaceholder: byId("qrPlaceholder"),
  qrImage: byId("qrImage"),
  downloadQr: byId("downloadQr"),
  toast: byId("toast")
};

function adminCloudSessionReady() {
  if (!cloud.enabled) return false;
  return sessionStorage.getItem(SESSION_KEY) === "true" && !!cloud.user && cloud.user.isAnonymous !== true;
}

function friendlyFirebaseError(error) {
  const code = error?.code ? ` (${error.code})` : "";
  return `${error?.message || "Errore Firebase"}${code}`;
}

function setCloudStatus(message, level = "info") {
  cloud.status = message;
  const prefix = cloud.enabled ? "Firebase" : "Locale";
  const text = `${prefix}: ${message}`;
  if (els.firebaseStatus) {
    els.firebaseStatus.textContent = text;
    els.firebaseStatus.dataset.level = level;
  }
  if (els.firebaseStatusText) {
    els.firebaseStatusText.textContent = text;
    els.firebaseStatusText.dataset.level = level;
  }
}

function updateCloudUI() {
  const configured = cloud.enabled;
  if (els.firebaseLoginFields) els.firebaseLoginFields.classList.toggle("hidden", !configured);
  if (els.firebaseLoginHint) {
    els.firebaseLoginHint.textContent = configured
      ? "Con Firebase attivo, il codice apre il pannello e l'email/password protegge davvero le modifiche online."
      : "Firebase non e configurato: il sito funziona solo in locale e le modifiche restano su questo browser.";
  }
  if (els.seedFirebaseButton) {
    els.seedFirebaseButton.disabled = !configured || !adminCloudSessionReady();
  }
}

async function initCloud() {
  updateCloudUI();
  if (!cloud.enabled) {
    setCloudStatus("non configurato. Modifiche e ordini restano solo su questo dispositivo.", "warning");
    return;
  }

  try {
    cloud.app = initializeApp(firebaseConfig);
    cloud.auth = getAuth(cloud.app);
    cloud.db = getFirestore(cloud.app);
    subscribePublicCloudData();

    onAuthStateChanged(cloud.auth, user => {
      cloud.user = user;
      updateCloudUI();
      if (PAGE_MODE === "public") {
        if (user) subscribeCustomerOrders(user);
        else ensureCustomerAuth();
      }
      if (HAS_ADMIN_AREA) {
        const logged = adminCloudSessionReady();
        setAdminLogged(logged);
        if (logged) {
          subscribeAdminOrders();
          renderAdmin();
          const adminEmails = firebaseAdminEmails();
          if (adminEmails.length && !adminEmails.includes(String(user?.email || "").toLowerCase())) {
            setCloudStatus("accesso effettuato, ma questa email non e presente nell'elenco admin del file firebase-config.js.", "warning");
          }
        } else if (cloud.unsubscribeOrders && cloud.lastOrdersScope === "admin") {
          cloud.unsubscribeOrders();
          cloud.unsubscribeOrders = null;
          cloud.lastOrdersScope = "none";
        }
      }
    });

    if (PAGE_MODE === "public") await ensureCustomerAuth();
    setCloudStatus("collegato. Il catalogo verra aggiornato online in tempo reale.", "ok");
  } catch (error) {
    console.error(error);
    setCloudStatus(`errore di configurazione: ${friendlyFirebaseError(error)}`, "error");
  }
}

function subscribePublicCloudData() {
  if (!cloud.enabled || !cloud.db) return;

  cloud.unsubscribeSettings = onSnapshot(
    doc(cloud.db, FIREBASE_SETTINGS_COLLECTION, FIREBASE_SETTINGS_DOC),
    snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data() || {};
        cloud.initialized = data.initialized === true;
        const migrated = migrateStore({ ...store, settings: { ...store.settings, ...data } });
        store.settings = migrated.settings;
        persistStoreCache();
        renderAll();
        setCloudStatus("impostazioni sincronizzate.", "ok");
      } else {
        cloud.initialized = false;
        setCloudStatus("database vuoto. Entra nell'admin e premi 'Carica dati attuali su Firebase'.", "warning");
      }
      applyCloudCatalogSnapshots();
    },
    error => setCloudStatus(`errore impostazioni: ${friendlyFirebaseError(error)}`, "error")
  );

  cloud.unsubscribeCategories = onSnapshot(
    collection(cloud.db, FIREBASE_CATEGORIES_COLLECTION),
    snapshot => {
      cloud.lastCategories = snapshot.docs.map(docSnap => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          name: String(data.name || "Categoria"),
          order: Number(data.order) || 0
        };
      });
      applyCloudCatalogSnapshots();
    },
    error => setCloudStatus(`errore categorie: ${friendlyFirebaseError(error)}`, "error")
  );

  cloud.unsubscribeProducts = onSnapshot(
    collection(cloud.db, FIREBASE_PRODUCTS_COLLECTION),
    snapshot => {
      cloud.lastProducts = snapshot.docs.map(docSnap => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          categoryId: data.categoryId || "",
          name: data.name || "Prodotto",
          description: data.description || "",
          price: Number(data.price) || 0,
          saleEnabled: data.saleEnabled === true,
          salePrice: parseOptionalPrice(data.salePrice),
          variants: Array.isArray(data.variants) ? data.variants : [],
          image: data.image || sampleImages.home,
          enabled: data.enabled !== false,
          order: Number(data.order) || 0
        };
      });
      applyCloudCatalogSnapshots();
    },
    error => setCloudStatus(`errore prodotti: ${friendlyFirebaseError(error)}`, "error")
  );
}

function applyCloudCatalogSnapshots() {
  if (!cloud.enabled) return;
  if (!cloud.lastCategories || !cloud.lastProducts) return;
  const hasCloudCatalog = cloud.initialized || cloud.lastCategories.length > 0 || cloud.lastProducts.length > 0;
  if (!hasCloudCatalog) return;
  const migrated = migrateStore({
    ...store,
    categories: cloud.lastCategories,
    products: cloud.lastProducts,
    orders: store.orders
  });
  store.categories = migrated.categories;
  store.products = migrated.products;
  persistStoreCache();
  renderAll();
}

async function ensureCustomerAuth() {
  if (!cloud.enabled || !cloud.auth) return null;
  if (cloud.auth.currentUser) {
    cloud.user = cloud.auth.currentUser;
    return cloud.user;
  }
  try {
    const credential = await signInAnonymously(cloud.auth);
    cloud.user = credential.user;
    return cloud.user;
  } catch (error) {
    setCloudStatus(`accesso cliente anonimo non riuscito: ${friendlyFirebaseError(error)}`, "error");
    return null;
  }
}

function subscribeCustomerOrders(user) {
  if (!cloud.enabled || !cloud.db || !user || HAS_ADMIN_AREA) return;
  const scope = `customer:${user.uid}`;
  if (cloud.unsubscribeOrders && cloud.lastOrdersScope === scope) return;
  if (cloud.unsubscribeOrders) cloud.unsubscribeOrders();
  cloud.lastOrdersScope = scope;
  const q = query(collection(cloud.db, FIREBASE_ORDERS_COLLECTION), where("customerUid", "==", user.uid));
  cloud.unsubscribeOrders = onSnapshot(q, snapshot => {
    const orders = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
    applyCloudOrders(orders);
  }, error => setCloudStatus(`errore ordini cliente: ${friendlyFirebaseError(error)}`, "error"));
}

function subscribeAdminOrders() {
  if (!cloud.enabled || !cloud.db || !adminCloudSessionReady()) return;
  if (cloud.unsubscribeOrders && cloud.lastOrdersScope === "admin") return;
  if (cloud.unsubscribeOrders) cloud.unsubscribeOrders();
  cloud.lastOrdersScope = "admin";
  cloud.unsubscribeOrders = onSnapshot(collection(cloud.db, FIREBASE_ORDERS_COLLECTION), snapshot => {
    const orders = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
    applyCloudOrders(orders);
  }, error => setCloudStatus(`errore ordini admin: ${friendlyFirebaseError(error)}`, "error"));
}

function applyCloudOrders(orders) {
  store.orders = Array.isArray(orders) ? orders.map((order, index) => ({
    id: order.id || uid("order"),
    code: order.code || String(index + 1).padStart(4, "0"),
    customerId: order.customerId || "",
    customerUid: order.customerUid || "",
    customerName: order.customerName || "",
    customerContact: order.customerContact || "",
    customerAddressType: order.customerAddressType || "",
    customerAddress: order.customerAddress || "",
    paymentMethod: order.paymentMethod || "",
    note: order.note || "",
    createdAt: order.createdAt || new Date(Number(order.createdAtMs) || Date.now()).toISOString(),
    createdAtMs: Number(order.createdAtMs) || Date.now(),
    status: order.status || "Ricevuto",
    total: Number(order.total) || 0,
    items: Array.isArray(order.items) ? order.items : []
  })) : [];
  persistStoreCache();
  renderMyOrders();
  renderAdminOrders();
}

function cleanForFirestore(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) => entry === undefined ? null : entry));
}

function settingsForCloud() {
  return cleanForFirestore({
    ...store.settings,
    initialized: true,
    updatedAtMs: Date.now()
  });
}

function categoryForCloud(category) {
  return cleanForFirestore({
    name: category.name || "Categoria",
    order: Number(category.order) || 0,
    updatedAtMs: Date.now()
  });
}

function productForCloud(product) {
  return cleanForFirestore({
    categoryId: product.categoryId || "",
    name: product.name || "Prodotto",
    description: product.description || "",
    price: Number(product.price) || 0,
    saleEnabled: product.saleEnabled === true,
    salePrice: product.saleEnabled ? parseOptionalPrice(product.salePrice) : null,
    variants: getProductVariants(product).map((variant, index) => ({
      id: variant.id || uid("var"),
      label: variant.label || "Opzione",
      price: Number(variant.price) || 0,
      salePrice: parseOptionalPrice(variant.salePrice),
      order: Number(variant.order) || index + 1
    })),
    image: product.image || sampleImages.home,
    enabled: product.enabled !== false,
    order: Number(product.order) || 0,
    updatedAtMs: Date.now()
  });
}

function orderForCloud(order) {
  return cleanForFirestore({
    ...order,
    customerUid: order.customerUid || cloud.user?.uid || "",
    updatedAtMs: Date.now()
  });
}

function scheduleCatalogSync() {
  if (!cloud.enabled || !adminCloudSessionReady()) return;
  window.clearTimeout(cloud.catalogSaveTimer);
  cloud.catalogSaveTimer = window.setTimeout(() => syncCatalogToCloud(false), 350);
}

async function syncCatalogToCloud(notify = false) {
  if (!cloud.enabled || !cloud.db) {
    if (notify) showToast("Firebase non configurato");
    return;
  }
  if (!adminCloudSessionReady()) {
    if (notify) showToast("Accedi all'admin con codice, email e password Firebase");
    return;
  }

  try {
    const [categorySnapshot, productSnapshot] = await Promise.all([
      getDocs(collection(cloud.db, FIREBASE_CATEGORIES_COLLECTION)),
      getDocs(collection(cloud.db, FIREBASE_PRODUCTS_COLLECTION))
    ]);
    const batch = writeBatch(cloud.db);
    batch.set(doc(cloud.db, FIREBASE_SETTINGS_COLLECTION, FIREBASE_SETTINGS_DOC), settingsForCloud(), { merge: true });

    const categoryIds = new Set(store.categories.map(category => category.id));
    for (const category of store.categories) {
      batch.set(doc(cloud.db, FIREBASE_CATEGORIES_COLLECTION, category.id), categoryForCloud(category), { merge: true });
    }
    categorySnapshot.docs.forEach(docSnap => {
      if (!categoryIds.has(docSnap.id)) batch.delete(doc(cloud.db, FIREBASE_CATEGORIES_COLLECTION, docSnap.id));
    });

    const productIds = new Set(store.products.map(product => product.id));
    for (const product of store.products) {
      batch.set(doc(cloud.db, FIREBASE_PRODUCTS_COLLECTION, product.id), productForCloud(product), { merge: true });
    }
    productSnapshot.docs.forEach(docSnap => {
      if (!productIds.has(docSnap.id)) batch.delete(doc(cloud.db, FIREBASE_PRODUCTS_COLLECTION, docSnap.id));
    });

    await batch.commit();
    cloud.initialized = true;
    setCloudStatus("catalogo salvato online.", "ok");
    if (notify) showToast("Dati salvati su Firebase");
  } catch (error) {
    console.error(error);
    setCloudStatus(`salvataggio non riuscito: ${friendlyFirebaseError(error)}`, "error");
    showToast("Errore Firebase: controlla regole, UID admin e configurazione");
  }
}

async function saveOrderToCloud(order) {
  if (!cloud.enabled || !cloud.db) return false;
  const user = await ensureCustomerAuth();
  if (!user) return false;
  order.customerUid = user.uid;
  try {
    await setDoc(doc(cloud.db, FIREBASE_ORDERS_COLLECTION, order.id), orderForCloud(order));
    setCloudStatus("ordine inviato online.", "ok");
    return true;
  } catch (error) {
    console.error(error);
    setCloudStatus(`ordine non inviato: ${friendlyFirebaseError(error)}`, "error");
    showToast("Errore invio ordine. Controlla connessione e regole Firebase.");
    return false;
  }
}

async function updateOrderStatusCloud(order) {
  if (!cloud.enabled || !adminCloudSessionReady()) return;
  try {
    await setDoc(doc(cloud.db, FIREBASE_ORDERS_COLLECTION, order.id), orderForCloud(order), { merge: true });
    setCloudStatus("ordine aggiornato online.", "ok");
  } catch (error) {
    console.error(error);
    setCloudStatus(`aggiornamento ordine non riuscito: ${friendlyFirebaseError(error)}`, "error");
    showToast("Errore aggiornamento ordine su Firebase");
  }
}

async function deleteOrderCloud(orderId) {
  if (!cloud.enabled || !adminCloudSessionReady()) return;
  try {
    await deleteDoc(doc(cloud.db, FIREBASE_ORDERS_COLLECTION, orderId));
    setCloudStatus("ordine eliminato online.", "ok");
  } catch (error) {
    console.error(error);
    setCloudStatus(`eliminazione ordine non riuscita: ${friendlyFirebaseError(error)}`, "error");
    showToast("Errore eliminazione ordine su Firebase");
  }
}

function sortedCategories() {
  return [...store.categories].sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, "it"));
}

function categoryOrderMap() {
  const map = new Map();
  sortedCategories().forEach((category, index) => map.set(category.id, index + 1));
  return map;
}

function sortedProducts(categoryId = null, includeHidden = false) {
  const orderMap = categoryOrderMap();
  return [...store.products]
    .filter(product => (includeHidden || product.enabled) && (!categoryId || product.categoryId === categoryId))
    .sort((a, b) => {
      const catDiff = (orderMap.get(a.categoryId) || 9999) - (orderMap.get(b.categoryId) || 9999);
      if (catDiff !== 0) return catDiff;
      return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, "it");
    });
}

function getProductVariants(product) {
  return Array.isArray(product?.variants)
    ? product.variants.filter(variant => variant && String(variant.label || "").trim())
    : [];
}

function parseOptionalPrice(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const price = Number.parseFloat(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function salePriceIsLower(originalPrice, salePrice) {
  const original = Number(originalPrice) || 0;
  return salePrice !== null && Number.isFinite(salePrice) && salePrice >= 0 && salePrice < original;
}

function baseSalePrice(product) {
  if (!product?.saleEnabled) return null;
  const salePrice = parseOptionalPrice(product.salePrice);
  return salePriceIsLower(Number(product.price) || 0, salePrice) ? salePrice : null;
}

function variantSalePrice(product, variant) {
  if (!product?.saleEnabled || !variant) return null;
  const salePrice = parseOptionalPrice(variant.salePrice);
  return salePriceIsLower(Number(variant.price) || 0, salePrice) ? salePrice : null;
}

function resolveVariant(product, variantId) {
  const variants = getProductVariants(product);
  if (!variants.length) return null;
  return variants.find(variant => variant.id === variantId) || variants[0];
}

function originalPriceForSelection(product, variantId = "") {
  const variant = resolveVariant(product, variantId);
  return variant ? Number(variant.price) || 0 : Number(product.price) || 0;
}

function effectivePriceForSelection(product, variantId = "") {
  const variant = resolveVariant(product, variantId);
  if (variant) {
    return variantSalePrice(product, variant) ?? (Number(variant.price) || 0);
  }
  return baseSalePrice(product) ?? (Number(product.price) || 0);
}

function selectionDiscountInfo(product, variantId = "") {
  const original = originalPriceForSelection(product, variantId);
  const effective = effectivePriceForSelection(product, variantId);
  const savings = Math.max(0, original - effective);
  const percent = original > 0 && savings > 0 ? Math.round((savings / original) * 100) : 0;
  return { hasDiscount: savings > 0, original, effective, savings, percent };
}

function productIsDiscounted(product) {
  if (!product?.saleEnabled) return false;
  const variants = getProductVariants(product);
  if (variants.length) return variants.some(variant => variantSalePrice(product, variant) !== null);
  return baseSalePrice(product) !== null;
}

function discountedProducts() {
  return sortedProducts(null, false).filter(productIsDiscounted);
}

function productDiscountInfo(product) {
  const variants = getProductVariants(product);
  const selections = variants.length
    ? variants.map(variant => selectionDiscountInfo(product, variant.id))
    : [selectionDiscountInfo(product, "")];
  const discounts = selections.filter(info => info.hasDiscount);
  if (!discounts.length) {
    return { hasDiscount: false, maxSavings: 0, maxPercent: 0 };
  }
  return {
    hasDiscount: true,
    maxSavings: Math.max(...discounts.map(info => info.savings)),
    maxPercent: Math.max(...discounts.map(info => info.percent))
  };
}

function productMinPrice(product) {
  const variants = getProductVariants(product);
  if (!variants.length) return effectivePriceForSelection(product, "");
  return Math.min(...variants.map(variant => effectivePriceForSelection(product, variant.id)));
}

function productMaxPrice(product) {
  const variants = getProductVariants(product);
  if (!variants.length) return effectivePriceForSelection(product, "");
  return Math.max(...variants.map(variant => effectivePriceForSelection(product, variant.id)));
}

function productMinOriginalPrice(product) {
  const variants = getProductVariants(product);
  if (!variants.length) return Number(product.price) || 0;
  return Math.min(...variants.map(variant => Number(variant.price) || 0));
}

function productMaxOriginalPrice(product) {
  const variants = getProductVariants(product);
  if (!variants.length) return Number(product.price) || 0;
  return Math.max(...variants.map(variant => Number(variant.price) || 0));
}

function formatCatalogPrice(product) {
  const min = productMinPrice(product);
  const max = productMaxPrice(product);
  return min === max ? formatMoney(min) : `Da ${formatMoney(min)}`;
}

function formatOriginalCatalogPrice(product) {
  const min = productMinOriginalPrice(product);
  const max = productMaxOriginalPrice(product);
  return min === max ? formatMoney(min) : `Da ${formatMoney(min)}`;
}

function discountBadgeText(product) {
  const info = productDiscountInfo(product);
  return info.hasDiscount ? `-${info.maxPercent}%` : "";
}

function discountSavingText(product) {
  const info = productDiscountInfo(product);
  return info.hasDiscount ? `Risparmi fino a ${formatMoney(info.maxSavings)}` : "";
}

function catalogPriceHTML(product) {
  const info = productDiscountInfo(product);
  if (!info.hasDiscount) return escapeHTML(formatCatalogPrice(product));
  return `
    <span class="old-price">${escapeHTML(formatOriginalCatalogPrice(product))}</span>
    <span class="sale-price">${escapeHTML(formatCatalogPrice(product))}</span>
    <span class="discount-info">${escapeHTML(discountSavingText(product))}</span>
  `;
}

function selectionPriceHTML(product, variantId = "") {
  const info = selectionDiscountInfo(product, variantId);
  if (!info.hasDiscount) return `<span>${escapeHTML(formatMoney(info.effective))}</span>`;
  return `
    <span class="old-price">${escapeHTML(formatMoney(info.original))}</span>
    <span class="sale-price">${escapeHTML(formatMoney(info.effective))}</span>
    <span class="discount-info">-${info.percent}% - risparmi ${escapeHTML(formatMoney(info.savings))}</span>
  `;
}

function selectedPrice(product, variantId) {
  return effectivePriceForSelection(product, variantId);
}

function destinationMinimums() {
  const configured = store?.settings?.destinationMinOrderTotals || {};
  return Object.fromEntries(ADDRESS_TYPES.map(type => [
    type,
    parseOptionalPrice(configured[type]) ?? parseOptionalPrice(store?.settings?.minOrderTotal) ?? DEFAULT_MIN_ORDER_TOTAL
  ]));
}

function getMinOrderTotal(addressType = "") {
  const minima = destinationMinimums();
  if (addressType && ADDRESS_TYPES.includes(addressType)) {
    return minima[addressType];
  }
  return parseOptionalPrice(store?.settings?.minOrderTotal) ?? DEFAULT_MIN_ORDER_TOTAL;
}

function renderDestinationMinimumInputs() {
  const inputs = document.querySelectorAll("[data-min-destination]");
  if (!inputs.length) return;
  const minima = destinationMinimums();
  inputs.forEach(input => {
    const type = input.dataset.minDestination;
    input.value = minima[type] ?? getMinOrderTotal();
  });
}

function collectDestinationMinimums() {
  const inputs = document.querySelectorAll("[data-min-destination]");
  const fallback = parseOptionalPrice(els.settingMinOrderTotal?.value) ?? DEFAULT_MIN_ORDER_TOTAL;
  const values = { ...DEFAULT_DESTINATION_MIN_ORDER_TOTALS };
  inputs.forEach(input => {
    const type = input.dataset.minDestination;
    if (!type || !ADDRESS_TYPES.includes(type)) return;
    values[type] = parseOptionalPrice(input.value) ?? fallback;
  });
  return values;
}

function sortCatalogProducts(products) {
  const orderMap = categoryOrderMap();
  const list = [...products];
  switch (sortMode) {
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
    case "priceAsc":
    case "price-asc":
      return list.sort((a, b) => productMinPrice(a) - productMinPrice(b) || a.name.localeCompare(b.name, "it"));
    case "priceDesc":
    case "price-desc":
      return list.sort((a, b) => productMinPrice(b) - productMinPrice(a) || a.name.localeCompare(b.name, "it"));
    case "category":
    default:
      return list.sort((a, b) => {
        const catDiff = (orderMap.get(a.categoryId) || 9999) - (orderMap.get(b.categoryId) || 9999);
        if (catDiff !== 0) return catDiff;
        return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, "it");
      });
  }
}

function productCountForCategory(categoryId) {
  return store.products.filter(product => product.categoryId === categoryId && product.enabled).length;
}

function categoryName(categoryId) {
  return store.categories.find(category => category.id === categoryId)?.name || "Senza categoria";
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function renderAll() {
  renderShopSettings();
  renderCategories();
  renderCatalog();
  renderCart();
  renderMyOrders();
  renderAdmin();
  updateAddressFields();
}

function renderShopSettings() {
  if (els.shopName) els.shopName.textContent = store.settings.shopName || "Casa Market";
  if (els.shopSubtitle) els.shopSubtitle.textContent = store.settings.subtitle || "Catalogo digitale del negozio";

  const topMessage = String(store.settings.topMessage || "").trim();
  if (els.topMessage) {
    els.topMessage.textContent = topMessage;
    els.topMessage.classList.toggle("hidden", !topMessage);
  }

  const catalogNotice = String(store.settings.catalogNotice || "").trim();
  if (els.catalogNotice) {
    els.catalogNotice.textContent = catalogNotice;
    els.catalogNotice.classList.toggle("hidden", !catalogNotice);
  }

  if (els.settingShopName) els.settingShopName.value = store.settings.shopName || "";
  if (els.settingSubtitle) els.settingSubtitle.value = store.settings.subtitle || "";
  if (els.settingMinOrderTotal) els.settingMinOrderTotal.value = getMinOrderTotal();
  renderDestinationMinimumInputs();
  if (els.settingCatalogNotice) els.settingCatalogNotice.value = store.settings.catalogNotice || "";
  if (els.settingTopMessage) els.settingTopMessage.value = store.settings.topMessage || "";
  if (els.qrUrlInput) els.qrUrlInput.value = store.settings.publicUrl || "";
}

function renderCategories() {
  if (!els.categoryList) return;
  const categories = sortedCategories();
  const totalCount = store.products.filter(product => product.enabled).length;
  const discountedCount = discountedProducts().length;
  const buttons = [
    `<button class="category-button ${activeCategoryId === "all" ? "active" : ""}" data-category="all" type="button">Tutti i prodotti<span class="category-count">${totalCount} articoli</span></button>`,
    `<button class="category-button discount-category ${activeCategoryId === DISCOUNT_CATEGORY_ID ? "active" : ""}" data-category="${DISCOUNT_CATEGORY_ID}" type="button">Offerte e sconti<span class="category-count">${discountedCount} articoli</span></button>`
  ];
  for (const category of categories) {
    const count = productCountForCategory(category.id);
    buttons.push(`<button class="category-button ${activeCategoryId === category.id ? "active" : ""}" data-category="${category.id}" type="button">${escapeHTML(category.name)}<span class="category-count">${count} articoli</span></button>`);
  }
  els.categoryList.innerHTML = buttons.join("");
  els.categoryList.querySelectorAll(".category-button").forEach(button => {
    button.addEventListener("click", () => {
      activeCategoryId = button.dataset.category;
      renderCategories();
      renderCatalog();
      closeCategoryMenu();
    });
  });
}

function renderCatalog() {
  if (!els.productGrid) return;
  const baseProducts = activeCategoryId === "all"
    ? sortedProducts(null, false)
    : activeCategoryId === DISCOUNT_CATEGORY_ID
      ? discountedProducts()
      : sortedProducts(activeCategoryId, false);
  const term = searchTerm.trim().toLowerCase();
  const filteredProducts = baseProducts.filter(product => {
    if (!term) return true;
    const variantText = getProductVariants(product).map(variant => variant.label).join(" ");
    return `${product.name} ${product.description} ${categoryName(product.categoryId)} ${variantText}`.toLowerCase().includes(term);
  });
  const products = sortCatalogProducts(filteredProducts);

  if (els.activeCategoryTitle) {
    els.activeCategoryTitle.textContent = activeCategoryId === "all"
      ? "Tutti i prodotti"
      : activeCategoryId === DISCOUNT_CATEGORY_ID
        ? "Offerte e prodotti scontati"
        : categoryName(activeCategoryId);
  }

  els.productGrid.innerHTML = products.map(product => productCardHTML(product)).join("");
  if (els.emptyCatalog) els.emptyCatalog.classList.toggle("hidden", products.length > 0);

  els.productGrid.querySelectorAll("[data-add-product]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const id = button.dataset.addProduct;
      const product = store.products.find(item => item.id === id && item.enabled);
      if (!product) return;
      if (getProductVariants(product).length) {
        openProductModal(id);
        return;
      }
      const quantityInput = document.querySelector(`[data-qty="${id}"]`);
      const quantity = Math.max(1, Number.parseInt(quantityInput?.value, 10) || 1);
      addToCart(id, quantity);
    });
  });

  els.productGrid.querySelectorAll("[data-open-options]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openProductModal(button.dataset.openOptions);
    });
  });

  els.productGrid.querySelectorAll("[data-detail-product]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openProductModal(button.dataset.detailProduct);
    });
  });

  els.productGrid.querySelectorAll("[data-product-card]").forEach(card => {
    card.addEventListener("click", event => {
      if (event.target.closest("button, input, select, textarea, a")) return;
      openProductModal(card.dataset.productCard);
    });
    card.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("button, input, select, textarea, a")) return;
      event.preventDefault();
      openProductModal(card.dataset.productCard);
    });
  });
}

function productCardHTML(product) {
  const description = product.description || "Descrizione non inserita.";
  const variants = getProductVariants(product);
  const hasVariants = variants.length > 0;
  const discountInfo = productDiscountInfo(product);
  const saleBadge = discountInfo.hasDiscount ? `<span class="sale-badge">Offerta ${escapeHTML(discountBadgeText(product))}</span>` : "";
  const variantSummary = hasVariants
    ? `<div class="variant-summary">${variants.length} opzioni: ${escapeHTML(variants.slice(0, 3).map(variant => variant.label).join(", "))}${variants.length > 3 ? "..." : ""}</div>`
    : "";
  const actionHTML = hasVariants
    ? `<div class="quantity-row single-action-row"><button class="primary-button full-button" data-open-options="${product.id}" type="button">Scegli opzioni</button></div>`
    : `<div class="quantity-row"><input data-qty="${product.id}" type="number" min="1" value="1" aria-label="Quantita per ${escapeHTML(product.name)}"><button class="primary-button" data-add-product="${product.id}" type="button">Aggiungi</button></div>`;

  return `
    <article class="product-card clickable-product ${discountInfo.hasDiscount ? "product-on-sale" : ""}" data-product-card="${product.id}" role="button" tabindex="0" aria-label="Apri dettaglio prodotto ${escapeHTML(product.name)}">
      <div class="product-image">${saleBadge}<img src="${product.image || sampleImages.home}" alt="${escapeHTML(product.name)}"></div>
      <div class="product-body">
        <div>
          <div class="product-category-label">${escapeHTML(categoryName(product.categoryId))}</div>
          <h3>${escapeHTML(product.name)}</h3>
        </div>
        <p class="product-description">${escapeHTML(description)}</p>
        ${variantSummary}
        <div class="product-price">${catalogPriceHTML(product)}</div>
        <div class="product-card-actions">
          <button class="mini-button detail-button" data-detail-product="${product.id}" type="button">Dettagli</button>
        </div>
        ${actionHTML}
      </div>
    </article>
  `;
}

function openProductModal(productId) {
  const product = store.products.find(item => item.id === productId && item.enabled);
  if (!product || !els.productModal || !els.productDetailContent) return;
  const description = product.description || "Descrizione non inserita.";
  const variants = getProductVariants(product);
  const selectedVariant = variants[0] || null;
  const discountInfo = productDiscountInfo(product);
  const saleNote = discountInfo.hasDiscount
    ? `<div class="sale-detail-note"><strong>Prodotto in offerta ${escapeHTML(discountBadgeText(product))}</strong><span>${escapeHTML(discountSavingText(product))}</span></div>`
    : "";
  const variantHTML = variants.length ? `
    <div class="variant-chooser">
      <div class="variant-title">Scegli opzione</div>
      <div class="variant-options">
        ${variants.map((variant, index) => `
          <label class="variant-option">
            <input type="radio" name="productVariant" value="${escapeHTML(variant.id)}" ${index === 0 ? "checked" : ""}>
            <span>${escapeHTML(variant.label)}</span>
            <strong class="variant-price-inline">${selectionPriceHTML(product, variant.id)}</strong>
          </label>
        `).join("")}
      </div>
    </div>
  ` : "";

  els.productDetailContent.innerHTML = `
    <div class="product-detail-grid">
      <div class="product-detail-image">
        ${discountInfo.hasDiscount ? `<span class="sale-badge detail-sale-badge">Offerta ${escapeHTML(discountBadgeText(product))}</span>` : ""}
        <img src="${product.image || sampleImages.home}" alt="${escapeHTML(product.name)}">
      </div>
      <div class="product-detail-info">
        <p class="eyebrow">${escapeHTML(categoryName(product.categoryId))}</p>
        <h2>${escapeHTML(product.name)}</h2>
        ${saleNote}
        <p class="product-detail-description">${escapeHTML(description)}</p>
        ${variantHTML}
        <div id="productDetailPrice" class="product-detail-price">${selectionPriceHTML(product, selectedVariant ? selectedVariant.id : "")}</div>
        <div class="product-detail-actions">
          <label>
            Quantita
            <input id="productDetailQty" type="number" min="1" value="1">
          </label>
          <button id="productDetailAdd" class="primary-button" type="button">Aggiungi al carrello</button>
        </div>
      </div>
    </div>
  `;

  const priceEl = byId("productDetailPrice");
  const detailQty = byId("productDetailQty");
  const detailAdd = byId("productDetailAdd");
  document.querySelectorAll("input[name='productVariant']").forEach(input => {
    input.addEventListener("change", () => {
      if (priceEl) priceEl.innerHTML = selectionPriceHTML(product, input.value);
    });
  });

  on(detailAdd, "click", () => {
    const quantity = Math.max(1, Number.parseInt(detailQty?.value, 10) || 1);
    const selectedInput = document.querySelector("input[name='productVariant']:checked");
    addToCart(product.id, quantity, selectedInput?.value || "");
    closeProductModal();
    openDrawer();
  });

  els.productModal.classList.remove("hidden");
  els.productModal.setAttribute("aria-hidden", "false");
}

function closeProductModal() {
  if (!els.productModal) return;
  els.productModal.classList.add("hidden");
  els.productModal.setAttribute("aria-hidden", "true");
}

function cartEntryKey(item) {
  return `${item.productId}__${item.variantId || "base"}`;
}

function addToCart(productId, quantity, variantId = "") {
  const product = store.products.find(item => item.id === productId && item.enabled);
  if (!product) {
    showToast("Prodotto non disponibile");
    return;
  }

  const variants = getProductVariants(product);
  const variant = variants.length ? resolveVariant(product, variantId) : null;
  const normalizedVariantId = variant ? variant.id : "";
  const key = cartEntryKey({ productId, variantId: normalizedVariantId });
  const existing = cart.find(item => cartEntryKey(item) === key);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, variantId: normalizedVariantId, quantity });
  }
  saveCart();
  renderCart();
  showToast("Prodotto aggiunto al carrello");
}

function cartItemView(item) {
  const product = store.products.find(productItem => productItem.id === item.productId);
  if (!product) return null;
  const variant = resolveVariant(product, item.variantId || "");
  const normalizedVariantId = variant?.id || "";
  const price = selectedPrice(product, normalizedVariantId);
  const originalPrice = originalPriceForSelection(product, normalizedVariantId);
  return {
    productId: item.productId,
    variantId: normalizedVariantId,
    quantity: item.quantity,
    product,
    variant,
    price,
    originalPrice,
    savings: Math.max(0, originalPrice - price),
    label: `${product.name}${variant ? " - " + variant.label : ""}`
  };
}

function renderCart() {
  if (!els.cartItems) return;
  let validItems = cart.map(cartItemView).filter(Boolean);

  const normalizedCart = validItems.map(item => ({ productId: item.productId, variantId: item.variant?.id || "", quantity: item.quantity }));
  const cartChanged = validItems.length !== cart.length || JSON.stringify(normalizedCart) !== JSON.stringify(cart);
  if (cartChanged) {
    cart = normalizedCart;
    validItems = cart.map(cartItemView).filter(Boolean);
    saveCart();
  }

  const count = validItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (els.cartBadge) els.cartBadge.textContent = count;
  if (els.cartTotal) els.cartTotal.textContent = formatMoney(total);
  updateMinimumOrderNotice(total, validItems.length);

  if (!validItems.length) {
    els.cartItems.innerHTML = `<div class="empty-state"><h3>Carrello vuoto</h3><p>Seleziona una categoria e aggiungi prodotti.</p></div>`;
    return;
  }

  els.cartItems.innerHTML = validItems.map(item => {
    const key = cartEntryKey(item);
    return `
      <div class="cart-item">
        <div class="item-row">
          <div>
            <div class="item-title">${escapeHTML(item.label)}</div>
            <div class="item-meta">${item.quantity} x ${formatMoney(item.price)}${item.savings > 0 ? ` <span class="cart-discount">invece di ${formatMoney(item.originalPrice)}</span>` : ""}</div>
          </div>
          <div class="item-controls" aria-label="Modifica quantita">
            <button type="button" data-cart-minus="${escapeHTML(key)}">-</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-plus="${escapeHTML(key)}">+</button>
            <button type="button" data-cart-remove="${escapeHTML(key)}" aria-label="Rimuovi">x</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  els.cartItems.querySelectorAll("[data-cart-plus]").forEach(button => {
    button.addEventListener("click", () => changeCartQty(button.dataset.cartPlus, 1));
  });
  els.cartItems.querySelectorAll("[data-cart-minus]").forEach(button => {
    button.addEventListener("click", () => changeCartQty(button.dataset.cartMinus, -1));
  });
  els.cartItems.querySelectorAll("[data-cart-remove]").forEach(button => {
    button.addEventListener("click", () => removeCartItem(button.dataset.cartRemove));
  });
}

function changeCartQty(key, delta) {
  const item = cart.find(entry => cartEntryKey(entry) === key);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(entry => cartEntryKey(entry) !== key);
  }
  saveCart();
  renderCart();
}

function removeCartItem(key) {
  cart = cart.filter(entry => cartEntryKey(entry) !== key);
  saveCart();
  renderCart();
}

function updateMinimumOrderNotice(total, itemCount) {
  if (!els.minOrderNotice || !els.submitOrderButton) return;
  const selectedType = els.customerAddressType?.value || "";
  const minOrderTotal = getMinOrderTotal(selectedType);
  const missing = Math.max(0, minOrderTotal - total);
  const hasDestination = ADDRESS_TYPES.includes(selectedType);
  els.submitOrderButton.disabled = itemCount === 0 || !hasDestination || total < minOrderTotal;
  els.minOrderNotice.classList.toggle("ok", itemCount > 0 && hasDestination && total >= minOrderTotal);
  if (!itemCount) {
    els.minOrderNotice.textContent = hasDestination
      ? `Ordine minimo per ${selectedType}: ${formatMoney(minOrderTotal)}.`
      : "Seleziona la destinazione per vedere la spesa minima richiesta.";
  } else if (!hasDestination) {
    els.minOrderNotice.textContent = "Seleziona la destinazione per calcolare la spesa minima dell'ordine.";
  } else if (missing > 0) {
    els.minOrderNotice.textContent = `Ordine minimo per ${selectedType}: ${formatMoney(minOrderTotal)}. Mancano ${formatMoney(missing)} per inviare l'ordine.`;
  } else {
    els.minOrderNotice.textContent = `Ordine minimo per ${selectedType} raggiunto: puoi inviare l'ordine.`;
  }
}

function requiresAddressDetail(addressType) {
  return addressType === "Casa / ufficio";
}

function updateAddressFields() {
  if (!els.customerAddressType || !els.customerAddress || !els.customerAddressWrap) return;
  const selectedType = els.customerAddressType.value;
  const required = requiresAddressDetail(selectedType);
  els.customerAddressWrap.classList.toggle("hidden", !required);
  els.customerAddress.required = required;
  els.customerAddress.placeholder = "Via, numero civico, citta";
  if (!required) els.customerAddress.value = "";
}

function renderMyOrders() {
  if (!els.myOrders) return;
  const customerId = getCustomerId();
  const customerUid = cloud.enabled && cloud.user ? cloud.user.uid : "";
  const orders = [...store.orders]
    .filter(order => order.customerId === customerId || (customerUid && order.customerUid === customerUid))
    .sort((a, b) => (Number(b.createdAtMs) || new Date(b.createdAt).getTime()) - (Number(a.createdAtMs) || new Date(a.createdAt).getTime()));

  if (!orders.length) {
    els.myOrders.innerHTML = `<div class="empty-state"><h3>Nessun ordine</h3><p>Quando invii un ordine, lo vedrai qui.</p></div>`;
    return;
  }

  els.myOrders.innerHTML = orders.map(order => orderCardHTML(order, false)).join("");
}

function orderCardHTML(order, adminView) {
  const itemsHTML = order.items.map(item => {
    const itemLabel = `${item.name || "Prodotto"}${item.variantName ? " - " + item.variantName : ""}`;
    const discountText = item.discount > 0 ? ` <span class="cart-discount">offerta: invece di ${formatMoney(item.originalPrice)}</span>` : "";
    return `<li>${escapeHTML(itemLabel)} - ${item.quantity} x ${formatMoney(item.price)}${discountText}</li>`;
  }).join("");
  const statusControl = adminView
    ? `<select data-status-order="${order.id}">${ORDER_STATUSES.map(status => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select>`
    : `<span class="status-pill">${escapeHTML(order.status)}</span>`;
  const deleteButton = adminView ? `<button class="mini-button danger" data-delete-order="${order.id}" type="button">Elimina</button>` : "";
  const addressTypeLine = order.customerAddressType
    ? `<div class="item-meta">Tipo consegna: ${escapeHTML(order.customerAddressType)}</div>`
    : "";
  const addressLine = order.customerAddress
    ? `<div class="item-meta">Indirizzo / dettagli: ${escapeHTML(order.customerAddress)}</div>`
    : "";

  return `
    <div class="order-card">
      <div class="order-top">
        <div>
          <div class="item-title">Ordine ${escapeHTML(order.code)}</div>
          <div class="item-meta">${new Date(order.createdAt).toLocaleString("it-IT")}</div>
        </div>
        ${statusControl}
      </div>
      <ul>${itemsHTML}</ul>
      <div class="item-meta">Cliente: ${escapeHTML(order.customerName || "-")}</div>
      <div class="item-meta">Telefono: ${escapeHTML(order.customerContact || "-")}</div>
      ${addressTypeLine || `<div class="item-meta">Tipo consegna: -</div>`}
      ${addressLine}
      <div class="item-meta">Pagamento: ${escapeHTML(order.paymentMethod || "-")}</div>
      ${order.note ? `<div class="item-meta">Note: ${escapeHTML(order.note)}</div>` : ""}
      <div class="cart-total"><span>Totale</span><strong>${formatMoney(order.total)}</strong></div>
      ${deleteButton}
    </div>
  `;
}

async function submitOrder(event) {
  event.preventDefault();
  const validItems = cart.map(cartItemView).filter(item => item && item.product.enabled);

  if (!validItems.length) {
    showToast("Aggiungi almeno un prodotto prima di inviare l'ordine");
    return;
  }

  const total = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const customerName = els.customerName?.value.trim() || "";
  const customerContact = els.customerContact?.value.trim() || "";
  const customerAddressType = els.customerAddressType?.value.trim() || "";
  const customerAddress = els.customerAddress?.value.trim() || "";
  const paymentMethod = els.customerPayment?.value.trim() || "";

  if (!customerName || !customerContact || !customerAddressType || !paymentMethod) {
    showToast("Compila nome, telefono, destinazione e metodo di pagamento");
    return;
  }

  if (!ADDRESS_TYPES.includes(customerAddressType)) {
    showToast("Seleziona un tipo di consegna valido");
    return;
  }

  if (requiresAddressDetail(customerAddressType) && !customerAddress) {
    showToast("Scrivi l'indirizzo della casa o dell'ufficio");
    return;
  }

  const minOrderTotal = getMinOrderTotal(customerAddressType);
  if (total < minOrderTotal) {
    showToast(`Spesa minima per ${customerAddressType}: ${formatMoney(minOrderTotal)}. Aggiungi altri prodotti.`);
    updateMinimumOrderNotice(total, validItems.length);
    return;
  }

  const cloudUser = cloud.enabled ? await ensureCustomerAuth() : null;
  if (cloud.enabled && !cloudUser) return;

  const createdAtMs = Date.now();
  const order = {
    id: uid("order"),
    code: String(createdAtMs).slice(-6),
    customerId: getCustomerId(),
    customerUid: cloudUser?.uid || "",
    customerName,
    customerContact,
    customerAddressType,
    customerAddress,
    paymentMethod,
    note: els.customerNote?.value.trim() || "",
    createdAt: new Date(createdAtMs).toISOString(),
    createdAtMs,
    status: "Ricevuto",
    total,
    items: validItems.map(item => ({
      productId: item.product.id,
      variantId: item.variant?.id || "",
      name: item.product.name,
      variantName: item.variant?.label || "",
      price: item.price,
      originalPrice: item.originalPrice,
      discount: item.savings,
      quantity: item.quantity,
      image: item.product.image || ""
    }))
  };

  if (cloud.enabled) {
    const saved = await saveOrderToCloud(order);
    if (!saved) return;
    if (!store.orders.some(existing => existing.id === order.id)) store.orders.push(order);
    persistStoreCache();
  } else {
    store.orders.push(order);
    saveStore();
  }
  cart = [];
  saveCart();
  if (els.checkoutForm) els.checkoutForm.reset();
  updateAddressFields();
  renderCart();
  renderMyOrders();
  renderAdminOrders();
  showToast("Ordine inviato. Puoi seguirlo in I miei ordini.");
}

function openCategoryMenu() {
  document.body.classList.add("category-menu-open");
  if (els.categoryBackdrop) els.categoryBackdrop.classList.remove("hidden");
  if (els.openCategories) els.openCategories.setAttribute("aria-expanded", "true");
}

function closeCategoryMenu() {
  document.body.classList.remove("category-menu-open");
  if (els.categoryBackdrop) els.categoryBackdrop.classList.add("hidden");
  if (els.openCategories) els.openCategories.setAttribute("aria-expanded", "false");
}

function openDrawer() {
  if (!els.ordersDrawer || !els.drawerBackdrop) return;
  els.ordersDrawer.classList.add("open");
  els.ordersDrawer.setAttribute("aria-hidden", "false");
  els.drawerBackdrop.classList.remove("hidden");
}

function closeDrawer() {
  if (!els.ordersDrawer || !els.drawerBackdrop) return;
  els.ordersDrawer.classList.remove("open");
  els.ordersDrawer.setAttribute("aria-hidden", "true");
  els.drawerBackdrop.classList.add("hidden");
}

function openAdmin() {
  if (!HAS_ADMIN_AREA || !els.adminModal) return;
  els.adminModal.classList.remove("hidden");
  els.adminModal.setAttribute("aria-hidden", "false");
  const logged = sessionStorage.getItem(SESSION_KEY) === "true" && (!cloud.enabled || adminCloudSessionReady());
  setAdminLogged(logged);
  updateCloudUI();
  if (logged) renderAdmin();
}

function closeAdmin() {
  if (!els.adminModal) return;
  els.adminModal.classList.add("hidden");
  els.adminModal.setAttribute("aria-hidden", "true");
}

function setAdminLogged(logged) {
  if (!els.adminLogin || !els.adminPanel) return;
  els.adminLogin.classList.toggle("hidden", logged);
  els.adminPanel.classList.toggle("hidden", !logged);
  updateCloudUI();
  if (!logged && els.adminPinInput) {
    els.adminPinInput.value = "";
  }
}

function renderAdmin() {
  if (!HAS_ADMIN_AREA || !els.adminPanel) return;
  renderAdminSettings();
  renderAdminCategories();
  renderProductSelectors();
  renderAdminProducts();
  renderAdminOrders();
  renderQRPreview();
}

function renderAdminSettings() {
  if (els.settingShopName) els.settingShopName.value = store.settings.shopName || "";
  if (els.settingSubtitle) els.settingSubtitle.value = store.settings.subtitle || "";
  if (els.settingMinOrderTotal) els.settingMinOrderTotal.value = getMinOrderTotal();
  renderDestinationMinimumInputs();
  if (els.settingCatalogNotice) els.settingCatalogNotice.value = store.settings.catalogNotice || "";
  if (els.settingTopMessage) els.settingTopMessage.value = store.settings.topMessage || "";
}

function renderAdminCategories() {
  if (!els.adminCategoryList) return;
  const categories = sortedCategories();
  if (!categories.length) {
    els.adminCategoryList.innerHTML = `<div class="empty-state"><h3>Nessuna categoria</h3><p>Aggiungi una categoria per iniziare.</p></div>`;
    return;
  }
  els.adminCategoryList.innerHTML = categories.map((category, index) => `
    <div class="admin-list-item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(category.name)}</div>
          <div class="item-meta">${store.products.filter(product => product.categoryId === category.id).length} prodotti collegati</div>
        </div>
        <div class="admin-row-actions">
          <button class="mini-button" data-cat-up="${category.id}" ${index === 0 ? "disabled" : ""} type="button">Su</button>
          <button class="mini-button" data-cat-down="${category.id}" ${index === categories.length - 1 ? "disabled" : ""} type="button">Giu</button>
          <button class="mini-button" data-cat-rename="${category.id}" type="button">Rinomina</button>
          <button class="mini-button danger" data-cat-delete="${category.id}" type="button">Elimina</button>
        </div>
      </div>
    </div>
  `).join("");

  els.adminCategoryList.querySelectorAll("[data-cat-up]").forEach(button => button.addEventListener("click", () => moveCategory(button.dataset.catUp, -1)));
  els.adminCategoryList.querySelectorAll("[data-cat-down]").forEach(button => button.addEventListener("click", () => moveCategory(button.dataset.catDown, 1)));
  els.adminCategoryList.querySelectorAll("[data-cat-rename]").forEach(button => button.addEventListener("click", () => renameCategory(button.dataset.catRename)));
  els.adminCategoryList.querySelectorAll("[data-cat-delete]").forEach(button => button.addEventListener("click", () => deleteCategory(button.dataset.catDelete)));
}

function renderProductSelectors() {
  if (!els.productCategorySelect || !els.adminProductFilter) return;
  const categories = sortedCategories();
  const currentCategoryValue = els.productCategorySelect.value;
  const options = categories.map(category => `<option value="${category.id}">${escapeHTML(category.name)}</option>`).join("");
  els.productCategorySelect.innerHTML = options || `<option value="">Crea prima una categoria</option>`;
  if (categories.some(category => category.id === currentCategoryValue)) {
    els.productCategorySelect.value = currentCategoryValue;
  }
  const filterValue = els.adminProductFilter.value || "all";
  els.adminProductFilter.innerHTML = `<option value="all">Tutte le categorie</option>${options}`;
  if (["all", ...categories.map(category => category.id)].includes(filterValue)) {
    els.adminProductFilter.value = filterValue;
  }
}

function renderAdminProducts() {
  if (!els.adminProductList || !els.adminProductFilter) return;
  const filter = els.adminProductFilter.value || "all";
  const products = sortedProducts(filter === "all" ? null : filter, true);
  if (!products.length) {
    els.adminProductList.innerHTML = `<div class="empty-state"><h3>Nessun prodotto</h3><p>Aggiungi il primo prodotto dal modulo a sinistra.</p></div>`;
    return;
  }

  els.adminProductList.innerHTML = products.map(product => {
    const scopedProducts = sortedProducts(product.categoryId, true);
    const scopedIndex = scopedProducts.findIndex(item => item.id === product.id);
    const variants = getProductVariants(product);
    const variantText = variants.length ? ` - ${variants.length} varianti` : "";
    const saleText = productIsDiscounted(product) ? ` - Offerta ${discountBadgeText(product)}` : "";
    return `
      <div class="admin-list-item">
        <div class="product-admin-top">
          <div class="admin-product-thumb"><img src="${product.image || sampleImages.home}" alt="${escapeHTML(product.name)}"></div>
          <div>
            <div class="item-title">${escapeHTML(product.name)}</div>
            <div class="item-meta">${escapeHTML(categoryName(product.categoryId))} - ${formatCatalogPrice(product)}${variantText}${saleText} - ${product.enabled ? "Visibile" : "Nascosto"}</div>
          </div>
        </div>
        <div class="admin-row-actions">
          <button class="mini-button" data-prod-up="${product.id}" ${scopedIndex === 0 ? "disabled" : ""} type="button">Su</button>
          <button class="mini-button" data-prod-down="${product.id}" ${scopedIndex === scopedProducts.length - 1 ? "disabled" : ""} type="button">Giu</button>
          <button class="mini-button" data-prod-edit="${product.id}" type="button">Modifica</button>
          <button class="mini-button" data-prod-toggle="${product.id}" type="button">${product.enabled ? "Nascondi" : "Mostra"}</button>
          <button class="mini-button danger" data-prod-delete="${product.id}" type="button">Elimina</button>
        </div>
      </div>
    `;
  }).join("");

  els.adminProductList.querySelectorAll("[data-prod-up]").forEach(button => button.addEventListener("click", () => moveProduct(button.dataset.prodUp, -1)));
  els.adminProductList.querySelectorAll("[data-prod-down]").forEach(button => button.addEventListener("click", () => moveProduct(button.dataset.prodDown, 1)));
  els.adminProductList.querySelectorAll("[data-prod-edit]").forEach(button => button.addEventListener("click", () => editProduct(button.dataset.prodEdit)));
  els.adminProductList.querySelectorAll("[data-prod-toggle]").forEach(button => button.addEventListener("click", () => toggleProduct(button.dataset.prodToggle)));
  els.adminProductList.querySelectorAll("[data-prod-delete]").forEach(button => button.addEventListener("click", () => deleteProduct(button.dataset.prodDelete)));
}

function renderAdminOrders() {
  if (!els.adminOrdersList) return;
  const orders = [...store.orders].sort((a, b) => (Number(b.createdAtMs) || new Date(b.createdAt).getTime()) - (Number(a.createdAtMs) || new Date(a.createdAt).getTime()));
  if (!orders.length) {
    els.adminOrdersList.innerHTML = `<div class="empty-state"><h3>Nessun ordine ricevuto</h3><p>Gli ordini inviati dagli utenti appariranno qui.</p></div>`;
    return;
  }
  els.adminOrdersList.innerHTML = orders.map(order => orderCardHTML(order, true)).join("");
  els.adminOrdersList.querySelectorAll("[data-status-order]").forEach(select => {
    select.addEventListener("change", () => {
      const order = store.orders.find(item => item.id === select.dataset.statusOrder);
      if (!order) return;
      order.status = select.value;
      saveStore();
      updateOrderStatusCloud(order);
      renderMyOrders();
      showToast("Stato ordine aggiornato");
    });
  });
  els.adminOrdersList.querySelectorAll("[data-delete-order]").forEach(button => {
    button.addEventListener("click", () => {
      if (!window.confirm("Eliminare questo ordine?")) return;
      const orderId = button.dataset.deleteOrder;
      store.orders = store.orders.filter(order => order.id !== orderId);
      saveStore();
      deleteOrderCloud(orderId);
      renderAdminOrders();
      renderMyOrders();
    });
  });
}

function addCategory(event) {
  event.preventDefault();
  const name = els.categoryNameInput?.value.trim() || "";
  if (!name) return;
  store.categories.push({ id: uid("cat"), name, order: sortedCategories().length + 1 });
  saveStore();
  if (els.categoryNameInput) els.categoryNameInput.value = "";
  renderAll();
  showToast("Categoria aggiunta");
}

function moveCategory(categoryId, direction) {
  const categories = sortedCategories();
  const index = categories.findIndex(category => category.id === categoryId);
  const newIndex = index + direction;
  if (index < 0 || newIndex < 0 || newIndex >= categories.length) return;
  [categories[index], categories[newIndex]] = [categories[newIndex], categories[index]];
  categories.forEach((category, i) => category.order = i + 1);
  saveStore();
  renderAll();
}

function renameCategory(categoryId) {
  const category = store.categories.find(item => item.id === categoryId);
  if (!category) return;
  const name = window.prompt("Nuovo nome categoria", category.name);
  if (!name || !name.trim()) return;
  category.name = name.trim();
  saveStore();
  renderAll();
  showToast("Categoria rinominata");
}

function deleteCategory(categoryId) {
  const linkedProducts = store.products.filter(product => product.categoryId === categoryId).length;
  const message = linkedProducts
    ? `Questa categoria contiene ${linkedProducts} prodotti. Eliminarla insieme ai prodotti?`
    : "Eliminare questa categoria?";
  if (!window.confirm(message)) return;
  store.categories = store.categories.filter(category => category.id !== categoryId);
  store.products = store.products.filter(product => product.categoryId !== categoryId);
  if (activeCategoryId === categoryId) activeCategoryId = "all";
  saveStore();
  renderAll();
  showToast("Categoria eliminata");
}

function variantRowHTML(variant) {
  return `
    <label>
      Nome opzione
      <input data-variant-label type="text" placeholder="Es. 24 cm, Rosso, Grande" value="${escapeHTML(variant.label || "")}">
    </label>
    <label>
      Prezzo opzione
      <input data-variant-price type="number" step="0.01" min="0" placeholder="Es. 12.90" value="${variant.price !== undefined && variant.price !== null ? escapeHTML(variant.price) : ""}">
    </label>
    <label>
      Prezzo offerta
      <input data-variant-sale-price type="number" step="0.01" min="0" placeholder="Opzionale" value="${variant.salePrice !== undefined && variant.salePrice !== null ? escapeHTML(variant.salePrice) : ""}">
    </label>
    <button class="mini-button danger" data-remove-variant type="button">Rimuovi</button>
  `;
}

function addVariantRowToForm(variant = {}) {
  if (!els.productVariantsList) return;
  const row = document.createElement("div");
  row.className = "variant-row";
  row.dataset.variantRow = variant.id || uid("var");
  row.innerHTML = variantRowHTML(variant);
  const removeButton = row.querySelector("[data-remove-variant]");
  removeButton.addEventListener("click", () => row.remove());
  els.productVariantsList.appendChild(row);
}

function setProductVariantRows(variants = []) {
  if (!els.productVariantsList) return;
  els.productVariantsList.innerHTML = "";
  variants.forEach(variant => addVariantRowToForm(variant));
}

function collectProductVariants() {
  if (!els.productVariantsList) return [];
  const basePrice = Number.parseFloat(els.productPriceInput?.value) || 0;
  const rows = [...els.productVariantsList.querySelectorAll("[data-variant-row]")];
  return rows.map((row, index) => {
    const label = row.querySelector("[data-variant-label]")?.value.trim() || "";
    if (!label) return null;
    const priceValue = row.querySelector("[data-variant-price]")?.value;
    const salePriceValue = row.querySelector("[data-variant-sale-price]")?.value;
    const price = priceValue === "" ? basePrice : Number.parseFloat(priceValue);
    return {
      id: row.dataset.variantRow || uid("var"),
      label,
      price: Number.isFinite(price) ? price : basePrice,
      salePrice: parseOptionalPrice(salePriceValue),
      order: index + 1
    };
  }).filter(Boolean);
}

async function saveProduct(event) {
  event.preventDefault();
  const categoryId = els.productCategorySelect?.value || "";
  if (!categoryId) {
    showToast("Crea prima una categoria");
    return;
  }

  const image = await readSelectedImage(els.productImageInput?.files?.[0]);
  const editingId = els.editingProductId?.value || "";
  const saleEnabled = els.productSaleEnabledInput ? els.productSaleEnabledInput.checked : false;
  const variants = collectProductVariants();
  const payload = {
    categoryId,
    name: els.productNameInput?.value.trim() || "",
    description: els.productDescInput?.value.trim() || "",
    price: Number.parseFloat(els.productPriceInput?.value) || 0,
    saleEnabled,
    salePrice: saleEnabled ? parseOptionalPrice(els.productSalePriceInput?.value) : null,
    variants: saleEnabled ? variants : variants.map(variant => ({ ...variant, salePrice: null })),
    enabled: els.productEnabledInput ? els.productEnabledInput.checked : true
  };

  if (!payload.name) {
    showToast("Inserisci il nome del prodotto");
    return;
  }

  if (payload.saleEnabled) {
    const hasValidDiscount = payload.variants.length
      ? payload.variants.some(variant => salePriceIsLower(variant.price, variant.salePrice))
      : salePriceIsLower(payload.price, payload.salePrice);
    if (!hasValidDiscount) {
      showToast("Per mettere il prodotto in offerta inserisci un prezzo offerta inferiore al prezzo normale");
      return;
    }
  }

  if (editingId) {
    const product = store.products.find(item => item.id === editingId);
    if (!product) return;
    Object.assign(product, payload);
    if (image) product.image = image;
    showToast("Prodotto aggiornato");
  } else {
    const order = sortedProducts(categoryId, true).length + 1;
    store.products.push({ id: uid("prod"), ...payload, image: image || sampleImages.home, order });
    showToast("Prodotto aggiunto");
  }

  saveStore();
  resetProductForm();
  renderAll();
}

function readSelectedImage(file) {
  if (!file) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 900;
        const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
        const width = Math.max(1, Math.round((img.width || maxSide) * scale));
        const height = Math.max(1, Math.round((img.height || maxSide) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function resetProductForm() {
  if (!els.productForm) return;
  els.productForm.reset();
  if (els.editingProductId) els.editingProductId.value = "";
  if (els.productEnabledInput) els.productEnabledInput.checked = true;
  if (els.productSaleEnabledInput) els.productSaleEnabledInput.checked = false;
  if (els.productSalePriceInput) els.productSalePriceInput.value = "";
  setProductVariantRows([]);
  renderProductSelectors();
}

function editProduct(productId) {
  const product = store.products.find(item => item.id === productId);
  if (!product) return;
  if (els.editingProductId) els.editingProductId.value = product.id;
  if (els.productCategorySelect) els.productCategorySelect.value = product.categoryId;
  if (els.productNameInput) els.productNameInput.value = product.name;
  if (els.productPriceInput) els.productPriceInput.value = product.price;
  if (els.productSaleEnabledInput) els.productSaleEnabledInput.checked = product.saleEnabled === true;
  if (els.productSalePriceInput) els.productSalePriceInput.value = product.salePrice !== undefined && product.salePrice !== null ? product.salePrice : "";
  if (els.productDescInput) els.productDescInput.value = product.description || "";
  if (els.productEnabledInput) els.productEnabledInput.checked = product.enabled;
  if (els.productImageInput) els.productImageInput.value = "";
  setProductVariantRows(getProductVariants(product));
  showToast("Prodotto caricato nel modulo");
}

function toggleProduct(productId) {
  const product = store.products.find(item => item.id === productId);
  if (!product) return;
  product.enabled = !product.enabled;
  saveStore();
  renderAll();
}

function deleteProduct(productId) {
  if (!window.confirm("Eliminare questo prodotto?")) return;
  store.products = store.products.filter(product => product.id !== productId);
  cart = cart.filter(item => item.productId !== productId);
  saveStore();
  saveCart();
  renderAll();
}

function moveProduct(productId, direction) {
  const product = store.products.find(item => item.id === productId);
  if (!product) return;
  const scopedProducts = sortedProducts(product.categoryId, true);
  const index = scopedProducts.findIndex(item => item.id === productId);
  const newIndex = index + direction;
  if (index < 0 || newIndex < 0 || newIndex >= scopedProducts.length) return;
  [scopedProducts[index], scopedProducts[newIndex]] = [scopedProducts[newIndex], scopedProducts[index]];
  scopedProducts.forEach((item, i) => item.order = i + 1);
  saveStore();
  renderAll();
}

function saveSettings(event) {
  event.preventDefault();
  store.settings.shopName = els.settingShopName?.value.trim() || "Casa Market";
  store.settings.subtitle = els.settingSubtitle?.value.trim() || "Catalogo digitale del negozio";
  const minOrderTotal = parseOptionalPrice(els.settingMinOrderTotal?.value);
  store.settings.minOrderTotal = minOrderTotal ?? DEFAULT_MIN_ORDER_TOTAL;
  store.settings.destinationMinOrderTotals = collectDestinationMinimums();
  store.settings.catalogNotice = els.settingCatalogNotice?.value.trim() || "";
  store.settings.topMessage = els.settingTopMessage?.value.trim() || "";
  saveStore();
  renderAll();
  showToast("Impostazioni salvate");
}

function renderQRPreview() {
  if (!els.qrImage || !els.downloadQr || !els.qrPlaceholder) return;
  const url = store.settings.publicUrl || "";
  if (!url) {
    els.qrImage.classList.add("hidden");
    els.downloadQr.classList.add("hidden");
    els.qrPlaceholder.classList.remove("hidden");
    return;
  }
  const src = qrServiceUrl(url);
  els.qrImage.src = src;
  els.downloadQr.href = src;
  els.qrImage.classList.remove("hidden");
  els.downloadQr.classList.remove("hidden");
  els.qrPlaceholder.classList.add("hidden");
}

function qrServiceUrl(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=18&data=${encodeURIComponent(url)}`;
}

function handleQrSubmit(event) {
  event.preventDefault();
  store.settings.publicUrl = els.qrUrlInput?.value.trim() || "";
  saveStore();
  renderQRPreview();
  showToast("QR generato");
}

function clearCompletedOrders() {
  if (!window.confirm("Cancellare gli ordini Consegnato e Annullato?")) return;
  const completedOrders = store.orders.filter(order => ["Consegnato", "Annullato"].includes(order.status));
  store.orders = store.orders.filter(order => !["Consegnato", "Annullato"].includes(order.status));
  saveStore();
  completedOrders.forEach(order => deleteOrderCloud(order.id));
  renderAdminOrders();
  renderMyOrders();
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const enteredCode = normalizeAdminCode(els.adminPinInput?.value || "");
  if (enteredCode !== adminCode()) {
    showToast("Codice admin non corretto");
    return;
  }

  if (cloud.enabled) {
    const email = els.adminEmailInput?.value.trim() || "";
    const password = els.adminPasswordInput?.value || "";
    if (!email || !password) {
      showToast("Inserisci anche email e password Firebase dell'admin");
      return;
    }
    try {
      const credential = await signInWithEmailAndPassword(cloud.auth, email, password);
      cloud.user = credential.user;
      sessionStorage.setItem(SESSION_KEY, "true");
      setAdminLogged(true);
      subscribeAdminOrders();
      renderAdmin();
      setCloudStatus("admin connesso. Le modifiche verranno salvate online.", "ok");
      showToast("Accesso admin riuscito");
    } catch (error) {
      console.error(error);
      setCloudStatus(`login admin non riuscito: ${friendlyFirebaseError(error)}`, "error");
      showToast("Email/password Firebase non corretti o Authentication non configurato");
    }
    return;
  }

  sessionStorage.setItem(SESSION_KEY, "true");
  setAdminLogged(true);
  renderAdmin();
  showToast("Accesso admin riuscito in modalita locale");
}

function bindEvents() {
  on(els.searchInput, "input", event => {
    searchTerm = event.target.value;
    renderCatalog();
  });
  on(els.sortSelect, "change", event => {
    sortMode = event.target.value;
    renderCatalog();
  });
  on(els.openCategories, "click", openCategoryMenu);
  on(els.closeCategories, "click", closeCategoryMenu);
  on(els.categoryBackdrop, "click", closeCategoryMenu);
  on(els.openOrders, "click", openDrawer);
  on(els.closeOrders, "click", closeDrawer);
  on(els.drawerBackdrop, "click", closeDrawer);
  on(els.checkoutForm, "submit", submitOrder);
  on(els.customerAddressType, "change", () => {
    updateAddressFields();
    renderCart();
  });

  on(els.closeProductModal, "click", closeProductModal);
  on(els.productModal, "click", event => {
    if (event.target === els.productModal) closeProductModal();
  });

  on(els.adminShortcut, "click", openAdmin);
  on(els.closeAdmin, "click", closeAdmin);
  on(els.adminModal, "click", event => {
    if (event.target === els.adminModal) closeAdmin();
  });
  on(els.adminLoginForm, "submit", handleAdminLogin);
  on(els.adminLogout, "click", async () => {
    sessionStorage.removeItem(SESSION_KEY);
    if (cloud.enabled && cloud.auth) {
      try { await signOut(cloud.auth); } catch (error) { console.warn(error); }
    }
    setAdminLogged(false);
    updateCloudUI();
  });
  on(els.settingsForm, "submit", saveSettings);
  on(els.categoryForm, "submit", addCategory);
  on(els.productForm, "submit", saveProduct);
  on(els.resetProductForm, "click", resetProductForm);
  on(els.addVariantRow, "click", () => addVariantRowToForm());
  on(els.adminProductFilter, "change", renderAdminProducts);
  on(els.clearCompletedOrders, "click", clearCompletedOrders);
  on(els.qrForm, "submit", handleQrSubmit);
  on(els.seedFirebaseButton, "click", () => syncCatalogToCloud(true));

  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeDrawer();
      closeCategoryMenu();
      closeProductModal();
      closeAdmin();
    }
  });

  if (HAS_ADMIN_AREA && window.location.hash === "#admin") {
    openAdmin();
  }
}

function switchTab(tab) {
  document.querySelectorAll(".tab-button").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".tab-page").forEach(page => page.classList.toggle("active", page.dataset.page === tab));
}

bindEvents();
renderAll();
initCloud();
