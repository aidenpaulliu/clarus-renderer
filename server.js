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

const CLARUS_LOGO_URI = "data:image/png;base64,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";

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
  res.json({ status: "ok", service: "clarus-renderer", version: "1.1.3" });
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
