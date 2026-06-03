const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET || "";

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
// TEMPLATE 1: edointerior cover
// ─────────────────────────────────────────────

function buildCoverHtml(backgroundImage, hookText, brandHandle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1440px; overflow: hidden; background: #fff; }
    .slide {
      position: relative; width: 1080px; height: 1440px; overflow: hidden;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff;
    }
    .background-image {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; object-position: center; display: block;
    }
    .gradient-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(
        to bottom,
        rgba(50,48,45,0) 0%, rgba(50,48,45,0) 55%, rgba(50,48,45,0.10) 63%,
        rgba(50,48,45,0.32) 72%, rgba(50,48,45,0.58) 82%,
        rgba(50,48,45,0.72) 91%, rgba(50,48,45,0.78) 100%
      );
    }
    .content {
      position: absolute; bottom: 180px; left: 64px; width: 900px;
      display: flex; flex-direction: column; align-items: flex-start; gap: 28px;
    }
    .hook-text {
      font-size: 86px; font-weight: 800; color: #ffffff;
      line-height: 1.08; letter-spacing: -0.04em;
    }
  </style>
</head>
<body>
  <div class="slide">
    <img class="background-image" src="${backgroundImage}" alt="" />
    <div class="gradient-overlay"></div>
    <div class="content"><p class="hook-text">${hookText}</p></div>
    <p style="position:absolute;bottom:80px;left:0;right:0;text-align:center;
      font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:28px;
      font-weight:300;color:rgba(255,255,255,0.75);letter-spacing:0.22em;
      text-transform:lowercase;">${brandHandle}</p>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// TEMPLATE 2: Clarus news cover
// ─────────────────────────────────────────────

const CLARUS_LOGO_URI = "data:image/jpeg;base64,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";

function buildNewsCoverHtml(backgroundImage, headlineHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1440px; overflow: hidden; background: #000; }
  .card { position: relative; width: 1080px; height: 1440px; overflow: hidden; }
  .bg {
    position: absolute; inset: 0; width: 1080px; height: 1440px;
    object-fit: cover; object-position: center top; display: block;
  }
  .gradient {
    position: absolute; inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(0,0,0,0.00) 0%,  rgba(0,0,0,0.00) 25%,
      rgba(0,0,0,0.30) 42%, rgba(0,0,0,0.68) 58%,
      rgba(0,0,0,0.86) 72%, rgba(0,0,0,0.93) 84%,
      rgba(0,0,0,0.95) 100%
    );
  }
  .logo {
    position: absolute; top: 85px; left: 85px;
    height: 68px; width: auto;
    filter: invert(1) brightness(2);
  }
  .text-block {
    position: absolute; left: 85px; right: 85px; bottom: 160px;
  }
  .category {
    font-family: 'Press Start 2P', 'Courier New', monospace;
    font-size: 18px; color: #ffffff;
    letter-spacing: 0.06em; line-height: 1;
    margin-bottom: 28px; text-transform: uppercase;
  }
  .headline {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-weight: 800; font-size: 72px; line-height: 1.05;
    color: #ffffff; letter-spacing: -0.03em; word-break: break-word;
  }
  .headline em {
    font-style: italic;
    text-decoration: underline;
    text-underline-offset: 8px;
    text-decoration-thickness: 3px;
  }
  .swipe {
    position: absolute; bottom: 80px; right: 85px;
    font-family: Georgia, serif; font-style: italic;
    font-size: 24px; color: rgba(255,255,255,0.70);
    letter-spacing: 0.01em; white-space: nowrap;
  }
</style>
</head>
<body>
<div class="card">
  <img class="bg" src="${backgroundImage}" alt="">
  <div class="gradient"></div>
  <img class="logo" src="${CLARUS_LOGO_URI}" alt="clarus.">
  <div class="text-block">
    <div class="category">TRENDING NEWS</div>
    <div class="headline" id="hl">${headlineHtml}</div>
  </div>
  <div class="swipe">swipe for more &#8594;</div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "clarus-renderer", version: "1.1.2" });
});

// ─────────────────────────────────────────────
// ROUTE: POST /render/cover  (edointerior)
// ─────────────────────────────────────────────

app.post("/render/cover", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { background_image, hook_text, brand_handle } = req.body;
  if (!background_image || !hook_text || !brand_handle) {
    return res.status(400).json({ error: "Missing required fields: background_image, hook_text, brand_handle" });
  }
  if (hook_text.length > 90) {
    return res.status(400).json({ error: `hook_text exceeds 90 character limit (${hook_text.length} chars)` });
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", args: PUPPETEER_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
    const html = buildCoverHtml(background_image, hook_text, brand_handle);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });
    await page.waitForFunction(
      () => { const img = document.querySelector(".background-image"); return img && img.complete && img.naturalHeight > 0; },
      { timeout: 15000 }
    ).catch(() => console.warn("Background image did not fully load"));
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
// ROUTE: POST /render/news-cover  (Clarus)
// ─────────────────────────────────────────────

app.post("/render/news-cover", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { background_image, headline, emphasis_phrase } = req.body;
  if (!background_image || !headline) {
    return res.status(400).json({ error: "Missing required fields: background_image, headline" });
  }

  let headlineHtml = headline;
  if (emphasis_phrase && headline.includes(emphasis_phrase)) {
    headlineHtml = headline.replace(emphasis_phrase, `<em>${emphasis_phrase}</em>`);
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", args: PUPPETEER_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
    const html = buildNewsCoverHtml(background_image, headlineHtml);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    // Wait for background image to load
    await page.waitForFunction(
      () => { const img = document.querySelector(".bg"); return img && img.complete && img.naturalHeight > 0; },
      { timeout: 15000 }
    ).catch(() => console.warn("Background image did not fully load"));

    // Wait for fonts to be fully parsed and applied — required for web fonts in Puppeteer
    await page.evaluate(() => document.fonts.ready);

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
