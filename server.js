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
