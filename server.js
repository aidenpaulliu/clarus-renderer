const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET || "";

// ─────────────────────────────────────────────
// COVER TEMPLATE
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
      position: relative;
      width: 1080px;
      height: 1440px;
      overflow: hidden;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #fff;
    }
    .background-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
    .gradient-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        rgba(50, 48, 45, 0)    0%,
        rgba(50, 48, 45, 0)    44%,
        rgba(50, 48, 45, 0.10) 53.5%,
        rgba(50, 48, 45, 0.32) 65%,
        rgba(50, 48, 45, 0.58) 76%,
        rgba(50, 48, 45, 0.72) 88%,
        rgba(50, 48, 45, 0.78) 100%
      );
    }
    .content {
      position: absolute;
      bottom: 92px;
      left: 64px;
      width: 916px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 28px;
    }
    .hook-text {
      font-size: 86px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.08;
      letter-spacing: -0.02em;
    }
  </style>
</head>
<body>
  <div class="slide">
    <img class="background-image" src="${backgroundImage}" alt="" />
    <div class="gradient-overlay"></div>
    <div class="content">
      <p class="hook-text">${hookText}</p>
    </div>
    <p style="
      position: absolute;
      bottom: 52px;
      left: 0;
      right: 0;
      text-align: center;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 28px;
      font-weight: 300;
      color: rgba(255, 255, 255, 0.75);
      letter-spacing: 0.22em;
      text-transform: lowercase;
    ">${brandHandle}</p>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "clarus-renderer", version: "1.0.0" });
});

// ─────────────────────────────────────────────
// RENDER ENDPOINT
// ─────────────────────────────────────────────

app.post("/render/cover", async (req, res) => {
  // Optional secret auth
  if (RENDER_SECRET) {
    const auth = req.headers["x-render-secret"];
    if (auth !== RENDER_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { background_image, hook_text, brand_handle } = req.body;

  if (!background_image || !hook_text || !brand_handle) {
    return res.status(400).json({
      error: "Missing required fields: background_image, hook_text, brand_handle",
    });
  }

  // Enforce 90 char limit on hook_text
  if (hook_text.length > 90) {
    return res.status(400).json({
      error: `hook_text exceeds 90 character limit (${hook_text.length} chars)`,
    });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    // Set viewport to exact slide dimensions
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });

    const html = buildCoverHtml(background_image, hook_text, brand_handle);

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });

    // Wait for background image to load
    await page.waitForFunction(
      () => {
        const img = document.querySelector(".background-image");
        return img && img.complete && img.naturalHeight > 0;
      },
      { timeout: 15000 }
    ).catch(() => {
      // Image may fail to load due to CDN restrictions — render anyway
      console.warn("Background image did not fully load — rendering without it");
    });

    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1080, height: 1440 },
      encoding: "base64",
    });

    await browser.close();

    res.json({
      png_base64: screenshot,
      width: 1080,
      height: 1440,
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error("Render error:", err);
    res.status(500).json({ error: err.message || "Render failed" });
  }
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Clarus renderer running on port ${PORT}`);
});
