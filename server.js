const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const cron = require("node-cron");
const { scrapeAllShops } = require("./jobs/scrapeAllshops");

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ✅ [API] 특정 매장 수동 수집 (테스트용)
app.post("/api/scrape/:shopId", async (req, res) => {
  try {
    const { scrapePopularTimes } = require("./scrape/scrapePopularTimes");
    const shopId = parseInt(req.params.shopId);
    const shop = await prisma.pizzaShop.findUnique({ where: { id: shopId } });

    if (!shop) return res.status(404).json({ error: "매장 없음" });

    const popularity = await scrapePopularTimes(shop.placeId);
    if (popularity === null)
      return res.status(500).json({ error: "혼잡도 수집 실패" });

    const now = new Date();
    const hour = now.getHours();
    let timeSlot = "00-06";
    if (hour < 12) timeSlot = hour < 6 ? "00-06" : "06-12";
    else timeSlot = hour < 18 ? "12-18" : "18-24";

    await prisma.shopMetric.create({
      data: {
        shopId: shop.id,
        date: new Date(now.toDateString()),
        timeSlot,
        popularity,
      },
    });

    res.json({ success: true, shop: shop.name, popularity, timeSlot });
  } catch (err) {
    console.error("❌ [SCRAPE ERROR]", err.message);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ✅ CRON 자동 수집: 6시간마다 실행
cron.schedule("0 */6 * * *", async () => {
  console.log("🕒 [CRON] Pentagon 2마일 이내 매장 혼잡도 자동 수집 시작");
  await scrapeAllShops();
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
