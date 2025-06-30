const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();

puppeteer.use(StealthPlugin());

/**
 * placeId 기준으로 Google Maps의 혼잡도(실시간 or 평균) 스크래핑
 */
async function scrapePopularTimes(placeId) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });
  });

  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForTimeout(5000);

    const data = await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll("div[aria-label*='현재 붐비는 정도']")
      );

      const target = elements.find((el) => {
        const label = el.getAttribute("aria-label");
        return label && label.includes("현재 붐비는 정도");
      });

      if (!target) return { current: null, average: null };

      const label = target.getAttribute("aria-label");

      const currentMatch = label.match(/현재 붐비는 정도:\s*(\d{1,3})%/);
      const averageMatch = label.match(/\(일반적으로는\s*(\d{1,3})%\)/);

      return {
        current: currentMatch ? parseInt(currentMatch[1]) : null,
        average: averageMatch ? parseInt(averageMatch[1]) : null,
      };
    });

    await browser.close();

    // 최종 값: 실시간 > 평균 > null
    return data.current !== null ? data.current : data.average;
  } catch (err) {
    console.error("❌ Scraping error:", err.message);
    await browser.close();
    return null;
  }
}

module.exports = { scrapePopularTimes };
