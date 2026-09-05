import type {
  Category,
  Product,
  ProductSummary,
  Review,
  Settings,
  Size,
  SizeScaleId,
} from "@shared/types";
import { FALLBACK_LOW_STOCK_THRESHOLD, stockLevel, totalStock } from "@shared/stock";

/**
 * THROWAWAY demo catalog (Requirements section 18, "Data source").
 *
 * The admin dashboard does not exist yet, so the storefront is reviewed
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
  lowStockThreshold: FALLBACK_LOW_STOCK_THRESHOLD,
  storeAnnouncement: "Free delivery on orders over Rs 5,000 — cash on delivery, nationwide.",
};

interface Seed {
  slug: string;
  name: string;
  price: number;
  categorySlug: string;
  description: string;
  /** Alt text for the front image — describes the garment, not the file. */
  alt: string;
  /** Which scale this piece is sized on. Defaults to `alpha` when absent. */
  sizeScale?: SizeScaleId;
  /**
   * Stock per size code — and the KEYS say which sizes the piece is sold in.
   * A shoe carries EU numbers here and a trouser carries waist inches; nothing
   * is sold in "Small, Medium and Large" merely because it used to be the only
   * option the type allowed.
   */
  sizes: Record<Size, number>;
  /** Days after T0 the product was added; drives `newest` ordering. */
  addedOn: number;
}

const seeds: Seed[] = [
  {
    slug: "meridian-oxford-shirt",
    name: "Meridian Oversized Drop Shoulder Shirt",
    price: 4290,
    categorySlug: "oxford-shirts",
    alt: "Meridian Oversized Drop Shoulder Shirt in ecru, laid flat",
    description:
      "An oversized drop-shoulder cut in a mid-weight oxford cotton that holds its shape after a wash. The shoulder seam sits low on the arm for a relaxed line through the body. Mother-of-pearl buttons, a single chest pocket, and a collar with enough structure to wear open or closed.",
    sizes: { XS: 4, S: 12, M: 8, L: 5, XL: 6, XXL: 3 },
    addedOn: 26,
  },
  {
    slug: "noor-linen-shirt",
    name: "Noor Oversized Drop Shoulder Shirt",
    price: 4890,
    categorySlug: "linen-shirts",
    alt: "Noor Oversized Drop Shoulder Shirt in warm sand, laid flat",
    description:
      "An oversized drop-shoulder cut in pure linen, washed soft before it reaches you, so it drapes from the first wear rather than the tenth. Built for Karachi humidity and long afternoons — breathable, light, and unbothered by creasing.",
    sizes: { S: 3, M: 9, L: 0, XL: 4, XXL: 2 },
    addedOn: 24,
  },
  {
    slug: "kohl-poplin-shirt",
    name: "Kohl Oversized Drop Shoulder Shirt",
    price: 3990,
    categorySlug: "oxford-shirts",
    alt: "Kohl Oversized Drop Shoulder Shirt in deep charcoal, laid flat",
    description:
      "A crisp poplin in a near-black charcoal — the shirt that works for a dinner, an interview, and the office on the same week. Slim through the sleeve, straight at the hem, finished with a hidden button stand.",
    sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
    addedOn: 21,
  },
  {
    slug: "sahil-camp-collar-shirt",
    name: "Sahil Oversized Drop Shoulder Shirt",
    price: 4590,
    categorySlug: "linen-shirts",
    alt: "Sahil Oversized Drop Shoulder Shirt in sage green, laid flat",
    description:
      "An open camp collar in a soft sage viscose blend, cut oversized with a dropped shoulder through the chest. Short sleeves, a boxy hem you can wear untucked, and a colour that sits well against every skin tone.",
    sizes: { S: 6, M: 2, L: 7, XL: 5, XXL: 4, "3XL": 2 },
    addedOn: 18,
  },
  {
    slug: "marble-twill-overshirt",
    name: "Marble Oversized Drop Shoulder Overshirt",
    price: 5690,
    categorySlug: "shirts",
    alt: "Marble Oversized Drop Shoulder Overshirt in stone grey, laid flat",
    description:
      "Half shirt, half light jacket. Heavy cotton twill, two chest pockets, and an oversized dropped shoulder that layers over a tee in October and under a coat in January.",
    sizes: { XS: 2, S: 4, M: 5, L: 11, XL: 7 },
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
    sizes: { S: 9, M: 14, L: 6, XL: 8, XXL: 5 },
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
    sizes: { S: 2, M: 0, L: 3, XL: 1 },
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
    sizes: { XS: 3, S: 7, M: 5, L: 0, XL: 4, XXL: 6 },
    addedOn: 19,
  },
  {
    slug: "sable-essential-hoodie",
    name: "Sable Essential Hoodie",
    price: 5490,
    categorySlug: "winter-collection",
    alt: "Sable Essential Hoodie in black, laid flat",
    description:
      "The plain one, done properly. A true black that stays black, a regular fit with room to layer, and reinforced seams at every stress point.",
    sizes: { S: 0, M: 3, L: 8, XL: 9, XXL: 4, "3XL": 1 },
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
    sizes: { XS: 6, S: 18, M: 22, L: 15, XL: 12, XXL: 7 },
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
    sizes: { S: 2, M: 1, L: 0, XL: 3 },
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
    sizes: { S: 5, M: 8, L: 4, XL: 6, XXL: 2 },
    addedOn: 9,
  },

  // --- Trousers -----------------------------------------------------------
  {
    slug: "amir-wide-leg-trouser",
    name: "Amir Wide-Leg Trouser",
    price: 5290,
    categorySlug: "trousers",
    alt: "Amir Wide-Leg Trouser in deep plum, laid flat",
    description:
      "A wide leg that falls straight from the knee, in a mid-weight cotton twill with a little body to it. Sits at the natural waist, with belt loops, slant pockets and an unfussy plain hem.",
    sizeScale: "waist-in",
    sizes: { "30": 6, "32": 9, "34": 7, "36": 4, "38": 2 },
    addedOn: 30,
  },
  {
    slug: "slate-pleated-trouser",
    name: "Slate Pleated Trouser",
    price: 5890,
    categorySlug: "trousers",
    alt: "Slate Pleated Trouser in graphite, laid flat",
    description:
      "A single forward pleat gives room through the hip and lets the leg hang clean. Graphite, pressed crease, and a fabric with just enough weight to keep its line through a long day.",
    sizeScale: "waist-in",
    sizes: { "28": 3, "30": 5, "32": 8, "34": 6, "36": 3 },
    addedOn: 28,
  },
  {
    slug: "yusuf-tapered-trouser",
    name: "Yusuf Tapered Trouser",
    price: 4690,
    categorySlug: "trousers",
    alt: "Yusuf Tapered Trouser in tobacco, laid flat",
    description:
      "Roomy through the thigh and tapered from the knee down, in a warm tobacco cotton. The one to wear with everything in the essentials edit.",
    sizeScale: "waist-in",
    sizes: { "30": 0, "32": 4, "34": 5, "36": 2 },
    addedOn: 23,
  },
  {
    slug: "basalt-cargo-trouser",
    name: "Basalt Cargo Trouser",
    price: 6190,
    categorySlug: "trousers",
    alt: "Basalt Cargo Trouser in olive, laid flat",
    description:
      "Two flap pockets set low on the leg, in a washed olive ripstop that softens with wear. Cut straight, not baggy, so it reads considered rather than utility.",
    sizeScale: "waist-in",
    sizes: { "28": 2, "30": 7, "32": 11, "34": 8, "36": 5, "38": 3, "40": 1 },
    addedOn: 20,
  },

  // --- Shoes --------------------------------------------------------------
  {
    slug: "rahi-low-top-sneaker",
    name: "Rahi Low-Top Sneaker",
    price: 8990,
    categorySlug: "shoes",
    alt: "Rahi Low-Top Sneaker in off-white, side profile",
    description:
      "A clean off-white low-top on a slim cupsole, with a padded collar and a leather-look upper that wipes down. Made to sit under a wide trouser without shouting.",
    sizeScale: "shoe-eu",
    sizes: { "38": 2, "39": 4, "40": 6, "41": 8, "42": 9, "43": 7, "44": 4, "45": 2 },
    addedOn: 29,
  },
  {
    slug: "onyx-court-sneaker",
    name: "Onyx Court Sneaker",
    price: 9490,
    categorySlug: "shoes",
    alt: "Onyx Court Sneaker in black, side profile",
    description:
      "A court silhouette in near-black, with a tonal panel and a gum-free white sole for contrast. The pair that works with the winter collection and with a shirt.",
    sizeScale: "shoe-eu",
    sizes: { "39": 0, "40": 3, "41": 5, "42": 6, "43": 4, "44": 2 },
    addedOn: 25,
  },
  {
    slug: "talha-runner",
    name: "Talha Runner",
    price: 7490,
    categorySlug: "shoes",
    alt: "Talha Runner in tobacco and cream, side profile",
    description:
      "A soft runner in tobacco suede-look panels on a cream midsole, cushioned enough for a full day of walking and quiet enough to wear with everything else here.",
    sizeScale: "shoe-eu",
    sizes: { "38": 3, "39": 5, "40": 7, "41": 10, "42": 12, "43": 8, "44": 5, "45": 3, "46": 1 },
    addedOn: 17,
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
  sizeScale: seed.sizeScale ?? "alpha",
  // Exactly the sizes the seed names — see `Product.sizes`. A key that is not
  // here is a size the piece is not made in, and the shop draws no button.
  sizes: Object.fromEntries(
    Object.entries(seed.sizes).map(([code, stock]) => [code, { stock }]),
  ),
  active: true,
  createdAt: T0 + seed.addedOn * day,
  updatedAt: T0 + seed.addedOn * day,
}));

/**
 * Customer reviews — `reviews/{productId}/{reviewId}`.
 *
 * Mock data for now, but shaped exactly like the real thing (requirements
 * sections 2 and 16): every review is tied to a confirmed order, carries a
 * display name only, and never exposes the customer's email or phone.
 *
 * These drive three things, so they are worth keeping realistic:
 *
 *  1. the landing page testimonials (section 2);
 *  2. the `ratingAvg` / `ratingCount` on every product summary, which are
 *     DERIVED below rather than typed by hand — the same precomputation the
 *     admin dashboard must do at write time (section 19);
 *  3. the reviews list on the product detail page, when section 16 builds it.
 *
 * `hidden` reviews exist here on purpose: an admin can hide spam (section 16),
 * and every read path must filter them out. One is seeded so that filter is
 * exercised rather than assumed.
 */
interface ReviewSeed {
  /** Product this review belongs to, by slug. */
  slug: string;
  rating: 1 | 2 | 3 | 4 | 5;
  displayName: string;
  comment: string;
  /** Days after T0 the review was left. */
  on: number;
  hidden?: boolean;
}

const reviewSeeds: ReviewSeed[] = [
  // --- Meridian Oxford Shirt ------------------------------------------------
  {
    slug: "meridian-oxford-shirt",
    rating: 5,
    displayName: "Ahmed Nawaz",
    comment:
      "Wore the oxford to a wedding in Rawalpindi and got asked where it was from twice. The collar holds its shape without any starch.",
    on: 26,
  },
  {
    slug: "meridian-oxford-shirt",
    rating: 5,
    displayName: "Fahad Iqbal",
    comment:
      "Fabric is thicker than the usual online oxford and it did not shrink after two washes. Medium fit me exactly as the size guide said.",
    on: 21,
  },
  {
    slug: "meridian-oxford-shirt",
    rating: 4,
    displayName: "Kamran Sheikh",
    comment:
      "Very good shirt for the price. It creases a little more than I expected, but a quick iron sorts it out.",
    on: 14,
  },

  // --- Noor Linen Shirt -----------------------------------------------------
  {
    slug: "noor-linen-shirt",
    rating: 5,
    displayName: "Bilal Ahmed",
    comment:
      "Perfect for Karachi weather. Stitching is clean and the size guide was accurate, which is rare when ordering online here.",
    on: 25,
  },
  {
    slug: "noor-linen-shirt",
    rating: 5,
    displayName: "Mariam Khan",
    comment:
      "Real linen, not a blend pretending to be one. It breathes properly in Hyderabad heat and looks smart untucked.",
    on: 19,
  },
  {
    slug: "noor-linen-shirt",
    rating: 4,
    displayName: "Owais Farooq",
    comment:
      "Lovely colour and finish. Linen wrinkles, so know what you are buying — but that is the fabric, not the shirt.",
    on: 12,
  },

  // --- Kohl Poplin Shirt ----------------------------------------------------
  {
    slug: "kohl-poplin-shirt",
    rating: 5,
    displayName: "Saad Rehman",
    comment:
      "Ordered it for interviews and ended up wearing it every week. The black has not faded at all after several washes.",
    on: 23,
  },
  {
    slug: "kohl-poplin-shirt",
    rating: 5,
    displayName: "Talha Mehmood",
    comment:
      "Crisp poplin, proper buttons, and the hidden placket looks expensive. Delivered to Faisalabad in three days.",
    on: 17,
  },
  {
    slug: "kohl-poplin-shirt",
    rating: 4,
    displayName: "Danish Bhatti",
    comment:
      "Slim through the sleeve, so size up if you have broader arms. Quality itself is excellent.",
    on: 10,
  },

  // --- Sahil Camp-Collar Shirt ---------------------------------------------
  {
    slug: "sahil-camp-collar-shirt",
    rating: 5,
    displayName: "Zohaib Ali",
    comment:
      "The sage colour is exactly as photographed. Light enough for Multan summers and the camp collar sits flat without fussing.",
    on: 20,
  },
  {
    slug: "sahil-camp-collar-shirt",
    rating: 4,
    displayName: "Anum Pervaiz",
    comment:
      "Bought it for my brother and he has not taken it off. Relaxed fit, good drape, arrived neatly pressed.",
    on: 13,
  },

  // --- Marble Twill Overshirt ----------------------------------------------
  {
    slug: "marble-twill-overshirt",
    rating: 5,
    displayName: "Usman Raza",
    comment:
      "Excellent quality for the price. I sized up on their advice and it layers really well over a kurta as well.",
    on: 22,
  },
  {
    slug: "marble-twill-overshirt",
    rating: 5,
    displayName: "Rehan Baig",
    comment:
      "Heavy twill that actually blocks the wind in Abbottabad. Works as a light jacket most of the year.",
    on: 11,
  },

  // --- Anwar Heavyweight Hoodie --------------------------------------------
  {
    slug: "anwar-heavyweight-hoodie",
    rating: 5,
    displayName: "Ayesha Siddiqui",
    comment:
      "Ordered on a Monday and it reached Lahore by Wednesday. The fleece is genuinely thick — not the thin stuff you usually get at this price.",
    on: 27,
  },
  {
    slug: "anwar-heavyweight-hoodie",
    rating: 5,
    displayName: "Hassan Javed",
    comment:
      "The hood actually stands up instead of flopping over, and the drawcords have not frayed. Worth every rupee.",
    on: 24,
  },
  {
    slug: "anwar-heavyweight-hoodie",
    rating: 5,
    displayName: "Iqra Waseem",
    comment:
      "Warmest thing I own now. Paid cash at the door in Islamabad and the courier waited while I checked the parcel.",
    on: 18,
  },
  {
    slug: "anwar-heavyweight-hoodie",
    rating: 4,
    displayName: "Waleed Akram",
    comment:
      "Very warm and well made. It is genuinely heavy, so it is winter-only — which is what I wanted.",
    on: 9,
  },

  // --- Dune Zip Hoodie ------------------------------------------------------
  {
    slug: "dune-zip-hoodie",
    rating: 5,
    displayName: "Nimra Shahid",
    comment:
      "The sand colour goes with everything and the zip feels solid, not the flimsy kind that catches.",
    on: 21,
  },
  {
    slug: "dune-zip-hoodie",
    rating: 4,
    displayName: "Junaid Rafiq",
    comment:
      "Cropped fit is accurate to the description. Sits right at the waist on me at 5'10 in a large.",
    on: 15,
  },
  {
    slug: "dune-zip-hoodie",
    rating: 4,
    displayName: "Hafsa Ejaz",
    comment:
      "Good weight for Sialkot autumn. Only wish they restocked medium faster — it sells out quickly.",
    on: 8,
  },

  // --- Ravi Cropped Hoodie --------------------------------------------------
  {
    slug: "ravi-cropped-hoodie",
    rating: 5,
    displayName: "Areeba Aslam",
    comment:
      "The clay shade is even nicer in person. Loop-back cotton, so it is comfortable indoors without overheating.",
    on: 19,
  },
  {
    slug: "ravi-cropped-hoodie",
    rating: 5,
    displayName: "Sidra Kamal",
    comment:
      "Second order from Velora and the packaging was just as careful. Delivered to Gujranwala in two days.",
    on: 16,
  },
  {
    slug: "ravi-cropped-hoodie",
    rating: 3,
    displayName: "Komal Riaz",
    comment:
      "Lovely material, but the crop is shorter than I expected on a small. Exchange for a medium was handled without any argument.",
    on: 7,
  },

  // --- Sable Essential Hoodie -----------------------------------------------
  {
    slug: "sable-essential-hoodie",
    rating: 5,
    displayName: "Zainab Malik",
    comment:
      "Delivery to Multan took three days and the packaging was proper — nothing was creased or damaged.",
    on: 23,
  },
  {
    slug: "sable-essential-hoodie",
    rating: 5,
    displayName: "Imran Qureshi",
    comment:
      "A true black that has stayed black. Plain, well cut, no oversized logo — exactly what I was looking for.",
    on: 14,
  },
  {
    slug: "sable-essential-hoodie",
    rating: 4,
    displayName: "Tooba Naveed",
    comment:
      "Roomy enough to layer over a shirt. Seams feel reinforced where they usually give way.",
    on: 6,
  },

  // --- Sadaf Boxy Tee -------------------------------------------------------
  {
    slug: "sadaf-boxy-tee",
    rating: 5,
    displayName: "Hira Fatima",
    comment:
      "Paid cash at the door in Islamabad, no advance payment stress. The tee is heavier than I expected and has kept its shape after four washes.",
    on: 26,
  },
  {
    slug: "sadaf-boxy-tee",
    rating: 5,
    displayName: "Sana Yousuf",
    comment:
      "Finally a plain tee that is not see-through. The neck rib has not stretched out, which is my usual complaint.",
    on: 20,
  },
  {
    slug: "sadaf-boxy-tee",
    rating: 5,
    displayName: "Faizan Sattar",
    comment:
      "Bought two. Pre-shrunk as claimed — same fit after washing as the day it arrived in Peshawar.",
    on: 13,
  },
  {
    slug: "sadaf-boxy-tee",
    rating: 4,
    displayName: "Amna Rashid",
    comment:
      "Boxy is boxy, so check the measurements before ordering. Fabric quality is excellent for the price.",
    on: 5,
  },
  {
    slug: "sadaf-boxy-tee",
    rating: 5,
    displayName: "Best Deals PK",
    comment:
      "CHEAPEST CLOTHES ONLINE VISIT OUR PAGE FOR DISCOUNT CODES AND FREE SHIPPING OFFERS",
    on: 4,
    hidden: true,
  },

  // --- Core Ribbed Tee ------------------------------------------------------
  {
    slug: "core-ribbed-tee",
    rating: 4,
    displayName: "Rabia Noor",
    comment:
      "Follows the shape without clinging, and it layers under a shirt without bunching at the waist.",
    on: 17,
  },
  {
    slug: "core-ribbed-tee",
    rating: 4,
    displayName: "Shahzaib Anwar",
    comment:
      "Good stretch and recovery. Runs slightly snug, so consider a size up if you prefer a looser fit.",
    on: 9,
  },

  // --- Rehan Crew Sweatshirt ------------------------------------------------
  {
    slug: "rehan-crew-sweatshirt",
    rating: 5,
    displayName: "Mehwish Adeel",
    comment:
      "The oat colour is beautiful and it has become the thing I reach for every evening in Quetta.",
    on: 18,
  },
  {
    slug: "rehan-crew-sweatshirt",
    rating: 5,
    displayName: "Adnan Yusuf",
    comment:
      "Clean, unbranded chest — exactly what I wanted. Cuffs are ribbed properly so the sleeves stay put.",
    on: 12,
  },
  {
    slug: "rehan-crew-sweatshirt",
    rating: 4,
    displayName: "Laiba Tariq",
    comment:
      "Comfortable and well finished. Arrived in Bahawalpur a day earlier than the estimate.",
    on: 6,
  },
];

/** Product id for a slug, so review seeds can be written against readable names. */
const productIdBySlug = new Map(demoProducts.map((p) => [p.slug, p.id]));

export const demoReviews: Review[] = reviewSeeds.map((seed, i) => ({
  id: `demo-rev-${String(i + 1).padStart(2, "0")}`,
  productId: productIdBySlug.get(seed.slug) ?? "",
  // The demo catalogue keeps every review tied to an order, so the shipped
  // demo shows the Verified badge on all of them. Reviews written for real are
  // open to anyone and mostly carry no order at all (`shared/reviews.ts`).
  orderId: `demo-ord-${String(i + 1).padStart(2, "0")}`,
  rating: seed.rating,
  comment: seed.comment,
  displayName: seed.displayName,
  verifiedPurchase: true,
  hidden: seed.hidden ?? false,
  photos: [],
  createdAt: T0 + seed.on * day,
}));

/**
 * Rating aggregates, precomputed per product from the visible reviews.
 *
 * This mirrors what the admin dashboard has to do whenever a review is written,
 * edited, hidden or removed: the storefront's grids must never compute an
 * average across a product's reviews at read time (requirements section 19).
 */
const ratingByProduct = new Map<string, { avg: number; count: number }>();

for (const product of demoProducts) {
  const visible = demoReviews.filter((r) => r.productId === product.id && !r.hidden);
  const count = visible.length;
  const avg =
    count === 0 ? 0 : Math.round((visible.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10;
  ratingByProduct.set(product.id, { avg, count });
}

/** `productSummaries/{id}` — the denormalised list projection. */
export const demoSummaries: ProductSummary[] = demoProducts.map((product) => {
  const remaining = totalStock(product.sizes);
  const rating = ratingByProduct.get(product.id) ?? { avg: 0, count: 0 };
  /**
   * Section 11: the SAME rule the `product_summaries` VIEW applies, imported
   * rather than restated. This used to read `<= threshold + 1`, so with the
   * shipped threshold of 4 a piece with 5 left was "Low stock" here and "In
   * stock" against the database — the badge changed meaning when
   * `VITE_DATA_SOURCE` flipped, and nothing would have caught it.
   */
  const level = stockLevel(remaining, demoSettings.lowStockThreshold);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    categorySlug: product.categorySlug,
    thumb: product.images[0].thumb,
    inStock: level !== "out-of-stock",
    lowStock: level === "low-stock",
    totalStock: remaining,
    ratingAvg: rating.avg,
    ratingCount: rating.count,
    active: true,
    createdAt: product.createdAt,
    searchText: `${product.name} ${product.categorySlug}`.toLowerCase(),
  };
});

/**
 * The demo catalog's categories, INCLUDING subcategories (requirements section 5).
 *
 * `parentSlug` is what makes one a subcategory, and the demo exercises the two
 * cases the storefront has to get right: a parent that still holds products of
 * its own (Shirts keeps the overshirt) and one that holds none directly
 * (Winter Collection — everything in it is a hoodie). Browsing either parent
 * shows the whole branch, because `queries.listProducts` expands the filter
 * through `shared/categories.ts`; browsing a child shows only the child.
 *
 * A subcategory carries no tile image on purpose: the shop renders children as
 * links under their parent's tile, never as tiles of their own, so art for one
 * would be a file nothing loads.
 */
export const demoCategories: Category[] = [
  {
    slug: "shirts",
    name: "Shirts",
    sortOrder: 1,
    thumb: "/categories/shirts.webp",
    description:
      "Oversized drop-shoulder shirts in poplin, oxford and slub cotton. The shoulder seam sits low for a relaxed line — wear them open over a tee or buttoned on their own.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "shirts").length,
  },
  {
    slug: "oxford-shirts",
    name: "Oxford & Poplin",
    parentSlug: "shirts",
    sortOrder: 1,
    description:
      "Crisp cotton weaves that hold a collar — the shirts that work for an office and a dinner in the same week.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "oxford-shirts").length,
  },
  {
    slug: "linen-shirts",
    name: "Linen & Viscose",
    parentSlug: "shirts",
    sortOrder: 2,
    description:
      "Soft, breathable and washed before they reach you. Built for humidity rather than for structure.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "linen-shirts").length,
  },
  {
    slug: "winter-collection",
    name: "Winter Collection",
    sortOrder: 2,
    thumb: "/categories/winter-collection.webp",
    description:
      "Heavyweight brushed fleece for Lahore and Islamabad winters, in the muted colours that go with everything already in the wardrobe.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "winter-collection").length,
  },
  {
    slug: "hoodies",
    name: "Hoodies",
    parentSlug: "winter-collection",
    sortOrder: 1,
    description:
      "Brushed fleece, heavyweight loopback and the zip-throughs that go over everything else.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "hoodies").length,
  },
  {
    slug: "shoes",
    name: "Shoes",
    sortOrder: 3,
    thumb: "/categories/shoes.webp",
    description:
      "Low-tops and runners on slim soles, in colours that sit under a wide trouser without competing with it.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "shoes").length,
  },
  {
    slug: "trousers",
    name: "Trousers",
    sortOrder: 4,
    thumb: "/categories/trousers.webp",
    description:
      "Wide legs, single pleats and a tapered cut, in cotton twill and washed ripstop. Cut to hang cleanly rather than cling.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "trousers").length,
  },
  {
    slug: "essentials",
    name: "Essentials",
    sortOrder: 5,
    thumb: "/categories/essentials.webp",
    description:
      "Plain tees, knits and the quiet layers underneath. The pieces that get worn twice a week and are replaced, not retired.",
    productCount: demoSummaries.filter((p) => p.categorySlug === "essentials").length,
  },
];
