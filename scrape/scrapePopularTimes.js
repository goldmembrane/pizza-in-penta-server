const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();

puppeteer.use(StealthPlugin());

function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

async function scrapePopularTimes(placeId, attempt = 1, maxAttempts = 3) {
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  const userAgent = getRandomUserAgent();

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const data = await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll("div[aria-label*='현재 붐비는 정도']")
      );

      const target = elements.find((el) => {
        const label = el.getAttribute("aria-label");
        return label && label.includes("현재 붐비는 정도");
      });

      if (!target) {
        return {
          popularity: null,
          source: null,
          reason: "Element with aria-label '현재 붐비는 정도' not found",
        };
      }

      const label = target.getAttribute("aria-label");
      const currentMatch = label.match(/현재 붐비는 정도:\s*(\d{1,3})%/);
      const averageMatch = label.match(/\(일반적으로는\s*(\d{1,3})%\)/);

      if (currentMatch) {
        return { popularity: parseInt(currentMatch[1]), source: "realtime" };
      } else if (averageMatch) {
        return { popularity: parseInt(averageMatch[1]), source: "average" };
      } else {
        return {
          popularity: null,
          source: null,
          reason: "Parsing failed: aria-label did not match expected format",
        };
      }
    });

    await browser.close();
    return data;
  } catch (err) {
    console.error(`❌ [Attempt ${attempt}] Scraping error:`, err.message);
    if (browser) await browser.close();

    if (attempt < maxAttempts) {
      console.log(`🔁 재시도 중... (${attempt + 1}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return scrapePopularTimes(placeId, attempt + 1, maxAttempts);
    }

    return {
      popularity: null,
      source: null,
      reason: `Exception: ${err.message}`,
    };
  }
}

module.exports = { scrapePopularTimes };
