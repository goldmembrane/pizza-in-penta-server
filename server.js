const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const { CronJob } = require("cron");
const { scrapeAllShops } = require("./jobs/scrapeAllshops");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const { savePointToDB } = require("./jobs/savePoints");

dotenv.config();
const app = express();
const prisma = new PrismaClient();
dayjs.extend(utc);
dayjs.extend(timezone);

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ✅ 워싱턴 기준: 매시 정각마다 혼잡도 수집
new CronJob(
  "0 17-22 * * *", // 매일 17시~22시 정각
  async () => {
    console.log("📊 [CRON] 워싱턴 기준 혼잡도 수집 시작");
    await scrapeAllShops();
  },
  null,
  true,
  "America/New_York"
);

// 포인트 계산: 하루 2회 (워싱턴 기준 → 서버 기준이 UTC라면 변환 필요)
// 워싱턴 기준 18:10 → 12-18 시간대 포인트 계산
new CronJob(
  "10 18 * * *",
  async () => {
    console.log("📈 [CRON] 워싱턴 18:10 → 12–18 포인트 계산");
    await savePointToDB();
  },
  null,
  true,
  "America/New_York"
);

// ✅ 워싱턴 23:10 (11:10 PM)
new CronJob(
  "0 23 * * *", // 매일 23시 정각
  async () => {
    console.log("📈 [CRON] 워싱턴 23:00 포인트 계산");
    await savePointToDB();
  },
  null,
  true,
  "America/New_York"
);

// ✅ [API] pointMetric 테이블 전체 조회
app.get("/api/point-metrics", async (req, res) => {
  try {
    const points = await prisma.pointMetric.findMany({
      orderBy: [{ date: "desc" }, { timeSlot: "desc" }],
      select: {
        date: true,
        timeSlot: true,
        point: true,
      },
    });

    // ✅ 워싱턴 기준 날짜 그대로 포맷만 YYYY-MM-DD로
    const formatted = points.map((p) => ({
      date: p.date.toISOString().slice(0, 10), // YYYY-MM-DD
      timeSlot: p.timeSlot,
      point: p.point,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("❌ [API ERROR] /api/point-metrics", err);
    res.status(500).json({ error: "서버 오류" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중:${PORT}`);
});
