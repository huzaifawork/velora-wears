import type {
  Category,
  Product,
  ProductSummary,
  Review,
  Settings,
  Size,
  SizeStock,
} from "@shared/types";

/**
 * THROWAWAY demo catalog (Requirements section 18, "Data source").
 *
 * The client has not bought the Blaze plan yet, so the storefront is reviewed
 * against this instead of the Realtime Database. Everything here is typed
 * against `shared/types.ts`, so the shapes cannot drift from what the admin
 * dashboard will eventually write — if this file compiles, the real records
 * will fit the same components.
 *
 * NEVER import this from a component or a page. Go through `lib/queries.ts`;
 * that indirection is what makes switching to the database a one-file change.
 *
 * Deleted, along with `public/products/*`, once the admin dashboard can create
 * real products.
 */

/** Fixed epoch so `createdAt` ordering is stable between builds. */
const T0 = Date.parse("2026-08-01T00:00:00Z");
const day = 86_400_000;

export const demoSettings: Settings = {
  deliveryCharge: 250,
  freeDeliveryThreshold: 5000,
  lowStockThreshold: 4,
  storeAnnouncement: "Free delivery on orders over Rs 5,000 — cash on delivery, nationwide.",
};

/** A product's total remaining units across every size. */
function totalStock(sizes: Record<Size, SizeStock>): number {
  return (Object.keys(sizes) as Size[]).reduce((sum, size) => sum + sizes[size].stock, 0);
}

interface Seed {
  slug: string;
  name: string;
  price: number;
  categorySlug: string;
  description: string;
  /** Alt text for the front image — describes the garment, not the file. */
  alt: string;
  sizes: Record<Size, number>;
  ratingAvg: number;
  ratingCount: number;
  /** Days after T0 the product was added; drives `newest` ordering. */
  addedOn: number;
}

const seeds: Seed[] = [
  {
    slug: "meridian-oxford-shirt",
    name: "Meridian Oxford Shirt",
    price: 4290,
    categorySlug: "shirts",
    alt: "Meridian Oxford Shirt in ecru, laid flat",
    description:
      "An everyday oxford cut clean through the body, in a mid-weight cotton that holds its shape after a wash. Mother-of-pearl buttons, a single chest pocket, and a collar with enough structure to wear open or closed.",
    sizes: { S: 12, M: 8, L: 5 },
    ratingAvg: 4.8,
    ratingCount: 24,
    addedOn: 26,
  },
  {
    slug: "noor-linen-shirt",
    name: "Noor Linen Shirt",
    price: 4890,
    categorySlug: "shirts",
    alt: "Noor Linen Shirt in warm sand, laid flat",
    description:
      "Pure linen, washed soft before it reaches you, so it drapes from the first wear rather than the tenth. Built for Karachi humidity and long afternoons — breathable, light, and unbothered by creasing.",
    sizes: { S: 3, M: 9, L: 0 },
    ratingAvg: 4.6,
    ratingCount: 31,
    addedOn: 24,
  },
  {
    slug: "kohl-poplin-shirt",
    name: "Kohl Poplin Shirt",
    price: 3990,
    categorySlug: "shirts",
    alt: "Kohl Poplin Shirt in deep charcoal, laid flat",
    description:
      "A crisp poplin in a near-black charcoal — the shirt that works for a dinner, an interview, and the office on the same week. Slim through the sleeve, straight at the hem, finished with a hidden button stand.",
    sizes: { S: 0, M: 0, L: 0 },
    ratingAvg: 4.7,
    ratingCount: 18,
    addedOn: 21,
  },
  {
    slug: "sahil-camp-collar-shirt",
    name: "Sahil Camp-Collar Shirt",
    price: 4590,
    categorySlug: "shirts",
    alt: "Sahil Camp-Collar Shirt in sage green, laid flat",
    description:
      "An open camp collar in a soft sage viscose blend, cut relaxed through the chest. Short sleeves, a boxy hem you can wear untucked, and a colour that sits well against every skin tone.",
    sizes: { S: 6, M: 2, L: 7 },
    ratingAvg: 4.5,
    ratingCount: 12,
    addedOn: 18,
  },
  {
    slug: "marble-twill-overshirt",
    name: "Marble Twill Overshirt",
    price: 5690,
    categorySlug: "shirts",
    alt: "Marble Twill Overshirt in stone grey, laid flat",
    description:
      "Half shirt, half light jacket. Heavy cotton twill, two chest pockets, and a squared shoulder that layers over a tee in October and under a coat in January.",
    sizes: { S: 4, M: 5, L: 11 },
    ratingAvg: 4.9,
    ratingCount: 9,
    addedOn: 15,
  },
  {
    slug: "anwar-heavyweight-hoodie",
    name: "Anwar Heavyweight Hoodie",
    price: 6490,
    categorySlug: "hoodies",
    alt: "Anwar Heavyweight Hoodie in deep plum, laid flat",
    description:
      "400 GSM brushed fleece with a double-layer hood that actually stands up. Ribbed cuffs and hem, a deep kangaroo pocket, and flat drawcords that do not fray. The one you will reach for all winter.",
    sizes: { S: 9, M: 14, L: 6 },
    ratingAvg: 4.9,
    ratingCount: 47,
    addedOn: 27,
  },
  {
    slug: "dune-zip-hoodie",
    name: "Dune Zip Hoodie",
    price: 6990,
    categorySlug: "hoodies",
    alt: "Dune Zip Hoodie in warm sand, laid flat",
    description:
      "A full-zip in a warm sand fleece, with a YKK zip and split kangaroo pockets. Cut slightly cropped so it sits at the waist, not below it.",
    sizes: { S: 2, M: 0, L: 3 },
    ratingAvg: 4.4,
    ratingCount: 15,
    addedOn: 22,
  },
  {
    slug: "ravi-cropped-hoodie",
    name: "Ravi Cropped Hoodie",
    price: 5890,
    categorySlug: "hoodies",
    alt: "Ravi Cropped Hoodie in clay, laid flat",
    description:
      "Boxy, cropped, and dyed a warm clay that softens with every wash. Loop-back cotton inside, so it breathes far better than a brushed fleece in mid-season weather.",
    sizes: { S: 7, M: 5, L: 0 },
    ratingAvg: 4.6,
    ratingCount: 21,
    addedOn: 19,
  },
  {
    slug: "sable-essential-hoodie",
    name: "Sable Essential Hoodie",
    price: 5490,
    categorySlug: "hoodies",
    alt: "Sable Essential Hoodie in black, laid flat",
    description:
      "The plain one, done properly. A true black that stays black, a regular fit with room to layer, and reinforced seams at every stress point.",
    sizes: { S: 0, M: 3, L: 8 },
    ratingAvg: 4.7,
    ratingCount: 33,
    addedOn: 16,
  },
  {
    slug: "sadaf-boxy-tee",
    name: "Sadaf Boxy Tee",
    price: 2490,
    categorySlug: "essentials",
    alt: "Sadaf Boxy Tee in off-white, laid flat",
    description:
      "A heavyweight 240 GSM cotton tee with a boxy body and a ribbed neck that holds. Pre-shrunk, so the fit you buy is the fit you keep.",
    sizes: { S: 18, M: 22, L: 15 },
    ratingAvg: 4.8,
    ratingCount: 56,
    addedOn: 25,
  },
  {
    slug: "core-ribbed-tee",
    name: "Core Ribbed Tee",
    price: 2290,
    categorySlug: "essentials",
    alt: "Core Ribbed Tee in black, laid flat",
    description:
      "A fine rib that follows the body without clinging to it. Stretches, recovers, and layers under a shirt or an overshirt without bunching.",
    sizes: { S: 2, M: 1, L: 0 },
    ratingAvg: 4.3,
    ratingCount: 14,
    addedOn: 12,
  },
  {
    slug: "rehan-crew-sweatshirt",
    name: "Rehan Crew Sweatshirt",
    price: 4990,
    categorySlug: "essentials",
    alt: "Rehan Crew Sweatshirt in oat, laid flat",
    description:
      "A classic crew in an oat-toned loop-back cotton, with ribbed cuffs and a clean, unbranded chest. Quietly the most worn thing in the collection.",
    sizes: { S: 5, M: 8, L: 4 },
    ratingAvg: 4.5,
    ratingCount: 27,
    addedOn: 9,
  },
];

/** Image dimensions match the committed files exactly, so the UI can reserve space. */
export const IMAGE_SIZE = {
  thumb: { width: 600, height: 800 },
  full: { width: 1100, height: 1467 },
} as const;

function imagePath(slug: string, index: 1 | 2, variant: "thumb" | "full") {
  return `/products/${slug}-${index}-${variant}.webp`;
}

/**
 * `products/{id}` — the detail records.
 *
 * The two derived list fields (`inStock`, `lowStock`) are NOT stored here; they
 * are computed into the summaries below, exactly as the admin dashboard will
 * have to compute them at write time (requirements section 19).
 */
export const demoProducts: Product[] = seeds.map((seed, i) => ({
  id: `demo-${String(i + 1).padStart(2, "0")}`,
  name: seed.name,
  slug: seed.slug,
  description: seed.description,
  price: seed.price,
  categorySlug: seed.categorySlug,
  images: [
    {
      thumb: imagePath(seed.slug, 1, "thumb"),
      full: imagePath(seed.slug, 1, "full"),
      alt: seed.alt,
      width: IMAGE_SIZE.full.width,
      height: IMAGE_SIZE.full.height,
    },
    {
      thumb: imagePath(seed.slug, 2, "thumb"),
      full: imagePath(seed.slug, 2, "full"),
      alt: `${seed.name} — fabric detail`,
      width: IMAGE_SIZE.full.width,
      height: IMAGE_SIZE.full.height,
    },
  ],
  sizes: {
    S: { stock: seed.sizes.S },
    M: { stock: seed.sizes.M },
    L: { stock: seed.sizes.L },
  },
  active: true,
  createdAt: T0 + seed.addedOn * day,
  updatedAt: T0 + seed.addedOn * day,
}));

/** `productSummaries/{id}` — the denormalised list projection. */
export const demoSummaries: ProductSummary[] = demoProducts.map((product, i) => {
  const seed = seeds[i];
  const remaining = totalStock(product.sizes);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    categorySlug: product.categorySlug,
    thumb: product.images[0].thumb,
    inStock: remaining > 0,
    lowStock: remaining > 0 && remaining <= demoSettings.lowStockThreshold + 1,
    ratingAvg: seed.ratingAvg,
    ratingCount: seed.ratingCount,
    active: true,
    createdAt: product.createdAt,
    searchText: `${product.name} ${product.categorySlug}`.toLowerCase(),
  };
});

export const demoCategories: Category[] = [
  {
    slug: "shirts",
    name: "Shirts",
    sortOrder: 1,
    thumb: "/categories/shirts.webp",
    productCount: demoSummaries.filter((p) => p.categorySlug === "shirts").length,
  },
  {
    slug: "hoodies",
    name: "Hoodies",
    sortOrder: 2,
    thumb: "/categories/hoodies.webp",
    productCount: demoSummaries.filter((p) => p.categorySlug === "hoodies").length,
  },
  {
    slug: "essentials",
    name: "Essentials",
    sortOrder: 3,
    thumb: "/categories/essentials.webp",
    productCount: demoSummaries.filter((p) => p.categorySlug === "essentials").length,
  },
];

/**
 * Customer reviews, used for the landing page testimonials (requirements
 * sections 2 and 16). Typed as real `Review` records so the testimonial strip
 * keeps working unchanged when section 16 wires it to genuine reviews.
 *
 * The email on the order is never part of this record — only a display name.
 */
export const demoReviews: Review[] = [
  {
    id: "demo-rev-1",
    productId: "demo-06",
    orderId: "demo-ord-1",
    rating: 5,
    comment:
      "Ordered the heavyweight hoodie on a Monday and it reached Lahore by Wednesday. The fleece is genuinely thick — not the thin stuff you usually get at this price.",
    displayName: "Ayesha Siddiqui",
    verifiedPurchase: true,
    hidden: false,
    createdAt: T0 + 20 * day,
  },
  {
    id: "demo-rev-2",
    productId: "demo-02",
    orderId: "demo-ord-2",
    rating: 5,
    comment:
      "The linen shirt is perfect for Karachi weather. Stitching is clean and the size guide was accurate, which is rare when ordering online here.",
    displayName: "Bilal Ahmed",
    verifiedPurchase: true,
    hidden: false,
    createdAt: T0 + 18 * day,
  },
  {
    id: "demo-rev-3",
    productId: "demo-10",
    orderId: "demo-ord-3",
    rating: 5,
    comment:
      "Paid cash at the door in Islamabad, no advance payment stress. The tee is heavier than I expected and has kept its shape after four washes.",
    displayName: "Hira Fatima",
    verifiedPurchase: true,
    hidden: false,
    createdAt: T0 + 16 * day,
  },
  {
    id: "demo-rev-4",
    productId: "demo-05",
    orderId: "demo-ord-4",
    rating: 4,
    comment:
      "The overshirt is excellent quality for the price. I sized up on advice from their team and it layers really well over a kurta as well.",
    displayName: "Usman Raza",
    verifiedPurchase: true,
    hidden: false,
    createdAt: T0 + 14 * day,
  },
  {
    id: "demo-rev-5",
    productId: "demo-09",
    orderId: "demo-ord-5",
    rating: 5,
    comment:
      "Second order from Velora. Delivery to Multan took three days and the packaging was proper — nothing was creased or damaged.",
    displayName: "Zainab Malik",
    verifiedPurchase: true,
    hidden: false,
    createdAt: T0 + 11 * day,
  },
  {
    id: "demo-rev-6",
    productId: "demo-01",
    orderId: "demo-ord-6",
    rating: 5,
    comment:
      "Wore the oxford to a wedding in Rawalpindi and got asked where it was from twice. Collar holds its shape without any starch.",
    displayName: "Ahmed Nawaz",
    verifiedPurchase: true,
    hidden: false,
    createdAt: T0 + 8 * day,
  },
];
