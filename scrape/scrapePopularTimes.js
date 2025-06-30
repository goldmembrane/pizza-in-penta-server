const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();

puppeteer.use(StealthPlugin());

/**
 * placeId 기준으로 Google Maps의 현재 시간대 혼잡도(%) 스크래핑
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

  // 👉 사용자 에이전트 변경
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  // 👉 navigator.webdriver 제거
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });
  });

  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForTimeout(5000);

    const popularity = await page.evaluate(() => {
      const bars = Array.from(
        document.querySelectorAll("div[aria-label*='Popular times']")
      ).flatMap((node) => Array.from(node.querySelectorAll("div[aria-label]")));
      const target = bars.find((bar) =>
        bar.getAttribute("aria-label")?.includes("Currently")
      );
      if (!target) return null;
      const label = target.getAttribute("aria-label");
      const match = label.match(/Currently.*?(\d{1,3})%/);
      return match ? parseInt(match[1]) : null;
    });

    await browser.close();
    return popularity;
  } catch (err) {
    console.error("❌ Scraping error:", err.message);
    await browser.close();
    return null;
  }
}

// ✅ 테스트
(async () => {
  const placeId = "ChIJQXXA5yJQtokRcO-h5D1nhbc"; // 예시
  const result = await scrapePopularTimes(placeId);
  console.log(
    "📊 현재 혼잡도:",
    result !== null ? `${result}%` : "데이터 없음"
  );
})();

module.exports = { scrapePopularTimes };
