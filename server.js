const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET || "";

// ─────────────────────────────────────────────
// BRAND TOKEN CONTRACT (read from req.body.brand)
// ─────────────────────────────────────────────
// The brand object is data, stored on the client row (jsonb) and forwarded
// by the edge function. The PRESET owns structure (layout, gradient stops,
// font sizes, anchor positions, translucency). The BRAND owns palette only.
//
// {
//   "layout_preset": "news_cover" | "image_first_cover",
//   "logo_url": "https://.../logo.png" | null,   // news_cover only; omitted if null
//   "colors": {
//     "background": "#000000",   // -> gradient base (hex, converted to rgb)
//     "text":       "#ffffff",   // -> headline / category / hook / handle / swipe base
//     "accent":     "#0071e3"    // optional; used only if emphasis_style.color set
//   },
//   "fonts": {
//     "headline":     "Helvetica Neue",
//     "category":     "Press Start 2P",
//     "google_fonts": ["Press Start 2P"]   // families needing a Google Fonts import; [] = none
//   },
//   "category_label": "TRENDING NEWS",          // news_cover; omitted if empty
//   "emphasis_style": { "italic": true, "underline": true, "color": "#0071e3"? },
//   "swipe_label":    "swipe for more →"        // news_cover
// }
//
// A brand that fits an existing preset = a row + a hosted logo, ZERO edits here.
// A brand that needs a NEW skeleton = a new preset function below (paid-tier work).

// ─────────────────────────────────────────────
// AUTH HELPER
// ─────────────────────────────────────────────

function checkAuth(req, res) {
  if (RENDER_SECRET && req.headers["x-render-secret"] !== RENDER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// PUPPETEER ARGS (shared)
// ─────────────────────────────────────────────

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--single-process",
];

// ─────────────────────────────────────────────
// TOKEN HELPERS
// ─────────────────────────────────────────────

// "#0a0b0c" -> "10,11,12". Returns fallback rgb string on bad input.
function hexToRgb(hex, fallback = "0,0,0") {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return fallback;
  return `${r},${g},${b}`;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb},${alpha})`;
}

// stops: array of [positionString, alphaNumber]
function buildGradient(rgb, stops) {
  const parts = stops.map(([pos, a]) => `${rgba(rgb, a)} ${pos}`).join(", ");
  return `linear-gradient(to bottom, ${parts})`;
}

function googleFontsLink(families) {
  if (!Array.isArray(families) || families.length === 0) return "";
  const params = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`)
    .join("&");
  return (
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="https://fonts.googleapis.com/css2?${params}&display=swap" rel="stylesheet">`
  );
}

function emphasisCss(style) {
  const s = style || {};
  const fontStyle = s.italic ? "italic" : "normal";
  const deco = s.underline ? "underline" : "none";
  const color = s.color ? `color:${s.color};` : "";
  return `font-style:${fontStyle};text-decoration:${deco};text-underline-offset:8px;text-decoration-thickness:3px;${color}`;
}

// Pull tokens with neutral fallbacks. Warns (does not crash) on missing values
// so a sparse brand renders something obviously generic rather than silently
// inheriting another brand's look.
function readBrand(brand, preset) {
  const b = brand || {};
  const colors = b.colors || {};
  const fonts = b.fonts || {};
  const warn = (msg) => console.warn(`[brand:${preset}] ${msg}`);

  if (!b.colors) warn("no colors object; using neutral defaults");

  return {
    logoUrl: b.logo_url || null,
    logoHeight: Number(b.logo_height) > 0 ? Number(b.logo_height) : 44, // px; brand-tunable
    bgRgb: hexToRgb(colors.background, "0,0,0"),
    textHex: colors.text || "#ffffff",
    textRgb: hexToRgb(colors.text, "255,255,255"),
    accent: colors.accent || null,
    headlineFont: fonts.headline || "Helvetica Neue",
    categoryFont: fonts.category || "Courier New",
    googleFonts: googleFontsLink(fonts.google_fonts),
    googleFontFamilies: Array.isArray(fonts.google_fonts) ? fonts.google_fonts : [],
    categoryLabel: b.category_label || "",
    emphasis: emphasisCss(b.emphasis_style),
    swipeLabel: b.swipe_label || "swipe for more \u2192",
    warn,
  };
}

// ─────────────────────────────────────────────
// PRESET: image_first_cover  (edointerior family)
// ─────────────────────────────────────────────

function buildImageFirstCoverHtml(backgroundImage, hookText, brandHandle, brand) {
  const t = readBrand(brand, "image_first_cover");

  // Preset-owned structure. Brand supplies only base colors + hook font.
  const gradient = buildGradient(t.bgRgb, [
    ["0%", 0], ["55%", 0], ["63%", 0.1], ["72%", 0.32],
    ["82%", 0.58], ["91%", 0.72], ["100%", 0.78],
  ]);
  const hookColor = t.textHex;
  const handleColor = rgba(t.textRgb, 0.75);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080" />
  ${t.googleFonts}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1440px; overflow: hidden; background: #fff; }
    .slide {
      position: relative; width: 1080px; height: 1440px; overflow: hidden;
      font-family: '${t.headlineFont}', Helvetica, Arial, sans-serif; background: #fff;
    }
    .background-image {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; object-position: center; display: block;
    }
    .gradient-overlay { position: absolute; inset: 0; background: ${gradient}; }
    .content {
      position: absolute; bottom: 180px; left: 64px; width: 900px;
      display: flex; flex-direction: column; align-items: flex-start; gap: 28px;
    }
    .hook-text {
      font-size: 86px; font-weight: 800; color: ${hookColor};
      line-height: 1.08; letter-spacing: -0.04em;
    }
    .handle {
      position: absolute; bottom: 80px; left: 0; right: 0; text-align: center;
      font-family: '${t.headlineFont}', Helvetica, Arial, sans-serif; font-size: 28px;
      font-weight: 300; color: ${handleColor}; letter-spacing: 0.22em; text-transform: lowercase;
    }
  </style>
</head>
<body>
  <div class="slide">
    <img class="background-image" src="${backgroundImage}" alt="" />
    <div class="gradient-overlay"></div>
    <div class="content"><p class="hook-text">${hookText}</p></div>
    <p class="handle">${brandHandle}</p>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// PRESET: news_cover  (Clarus family)
// ─────────────────────────────────────────────

function buildNewsCoverHtml(backgroundImage, headlineHtml, brand) {
  const t = readBrand(brand, "news_cover");
  if (!t.logoUrl) t.warn("no logo_url; rendering without logo");

  const gradient = buildGradient(t.bgRgb, [
    ["0%", 0], ["25%", 0], ["42%", 0.3], ["58%", 0.68],
    ["72%", 0.86], ["84%", 0.93], ["100%", 0.95],
  ]);

  const logoHtml = t.logoUrl ? `<img class="logo" src="${t.logoUrl}" alt="" />` : "";
  const categoryHtml = t.categoryLabel
    ? `<div class="category">${t.categoryLabel}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${t.googleFonts}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1440px; overflow: hidden; background: #000; }
  .card { position: relative; width: 1080px; height: 1440px; overflow: hidden; }
  .bg {
    position: absolute; inset: 0; width: 1080px; height: 1440px;
    object-fit: cover; object-position: center top; display: block;
  }
  .gradient { position: absolute; inset: 0; background: ${gradient}; }
  .logo { position: absolute; top: 85px; left: 85px; height: ${t.logoHeight}px; width: auto; }
  .text-block { position: absolute; left: 85px; right: 85px; bottom: 160px; }
  .category {
    font-family: '${t.categoryFont}', 'Courier New', monospace;
    font-size: 18px; color: ${t.textHex};
    letter-spacing: 0.06em; line-height: 1;
    margin-bottom: 28px; text-transform: uppercase;
  }
  .headline {
    /* Constant size. The text block is bottom-anchored and grows upward as the
       headline gets longer; the font size itself does not change. */
    font-family: '${t.headlineFont}', Helvetica, Arial, sans-serif;
    font-weight: 800; font-size: 64px; line-height: 1.1;
    color: ${t.textHex}; letter-spacing: -0.03em; word-break: break-word;
    text-transform: uppercase;
  }
  .headline em { ${t.emphasis} }
  .swipe {
    position: absolute; bottom: 80px; left: 85px;
    font-family: Georgia, serif; font-style: italic;
    font-size: 24px; color: ${rgba(t.textRgb, 0.7)};
    letter-spacing: 0.01em; white-space: nowrap;
  }
</style>
</head>
<body>
<div class="card">
  <img class="bg" src="${backgroundImage}" alt="">
  <div class="gradient"></div>
  ${logoHtml}
  <div class="text-block">
    ${categoryHtml}
    <div class="headline" id="hl">${headlineHtml}</div>
  </div>
  <div class="swipe">${t.swipeLabel}</div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "clarus-renderer", version: "1.4.1" });
});

// ─────────────────────────────────────────────
// ROUTE: POST /render/cover  (image_first_cover preset)
// ─────────────────────────────────────────────

app.post("/render/cover", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { background_image, hook_text, brand_handle, brand } = req.body;
  if (!background_image || !hook_text || !brand_handle) {
    return res.status(400).json({ error: "Missing required fields: background_image, hook_text, brand_handle" });
  }
  if (!brand || typeof brand !== "object") {
    return res.status(400).json({ error: "Missing required field: brand (object)" });
  }
  if (hook_text.length > 90) {
    return res.status(400).json({ error: `hook_text exceeds 90 character limit (${hook_text.length} chars)` });
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", args: PUPPETEER_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
    const html = buildImageFirstCoverHtml(background_image, hook_text, brand_handle, brand);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });
    await page
      .waitForFunction(
        () => { const img = document.querySelector(".background-image"); return img && img.complete && img.naturalHeight > 0; },
        { timeout: 15000 }
      )
      .catch(() => console.warn("Background image did not fully load"));
    await page.evaluate(() => document.fonts.ready);
    const screenshot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1440 }, encoding: "base64" });
    await browser.close();
    res.json({ png_base64: screenshot, width: 1080, height: 1440 });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error("Render error:", err);
    res.status(500).json({ error: err.message || "Render failed" });
  }
});

// ─────────────────────────────────────────────
// ROUTE: POST /render/news-cover  (news_cover preset)
// ─────────────────────────────────────────────

app.post("/render/news-cover", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { background_image, headline, emphasis_phrase, brand } = req.body;
  if (!background_image || !headline) {
    return res.status(400).json({ error: "Missing required fields: background_image, headline" });
  }
  if (!brand || typeof brand !== "object") {
    return res.status(400).json({ error: "Missing required field: brand (object)" });
  }

  let headlineHtml = headline;
  if (emphasis_phrase && headline.includes(emphasis_phrase)) {
    headlineHtml = headline.replace(emphasis_phrase, `<em>${emphasis_phrase}</em>`);
  }

  // Font families this brand imports from Google Fonts — wait for each so the
  // screenshot doesn't capture before the web font is applied. No font name is
  // hardcoded here; it comes from the brand row.
  const googleFamilies = Array.isArray(brand?.fonts?.google_fonts) ? brand.fonts.google_fonts : [];

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", args: PUPPETEER_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
    const html = buildNewsCoverHtml(background_image, headlineHtml, brand);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await page
      .waitForFunction(
        () => { const img = document.querySelector(".bg"); return img && img.complete && img.naturalHeight > 0; },
        { timeout: 15000 }
      )
      .catch(() => console.warn("Background image did not fully load"));
    // Wait for general font readiness, then explicitly load each brand Google font.
    await page.evaluate(async (families) => {
      await document.fonts.ready;
      await Promise.all(
        (families || []).map((f) => document.fonts.load(`18px '${f}'`).catch(() => {}))
      );
    }, googleFamilies);
    const screenshot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1440 }, encoding: "base64" });
    await browser.close();
    res.json({ png_base64: screenshot, width: 1080, height: 1440 });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error("News cover render error:", err);
    res.status(500).json({ error: err.message || "Render failed" });
  }
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Clarus renderer running on port ${PORT}`);
});
