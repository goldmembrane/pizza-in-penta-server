const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { PrismaClient } = require("@prisma/client");

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

// ✅ 시간 가중치 계산 함수 (워싱턴 기준)
function getTimeWeight(date) {
  const hour = dayjs(date).tz("America/New_York").hour();
  if (hour < 6) return 1.5;
  if (hour < 12) return 1.1;
  if (hour < 18) return 1.0;
  return 1.4;
}

// ✅ 포인트 계산 규칙
function computeDistribution(real, avg) {
  if (real === null || avg === null) return null;
  const diff = real - avg;
  let bonus = 0;

  if (diff >= 5 && diff < 10) bonus = 1;
  else if (diff >= 10 && diff < 20) bonus = 2;
  else if (diff >= 20) bonus = 3;

  return diff > 0 ? diff + bonus : diff;
}

// ✅ 포인트 계산 → DB 저장 함수
async function savePointToDB() {
  const records = await prisma.shopMetric.findMany({
    where: { source: "realtime" },
    orderBy: [{ date: "desc" }],
    take: 500,
  });

  if (records.length === 0) {
    console.warn("⚠️ 혼잡도 기록 없음. 포인트 저장 건너뜀");
    return;
  }

  // ✅ 워싱턴 기준 날짜와 시간대
  const washingtonTime = dayjs(records[0].date).tz("America/New_York");
  const latestDate = washingtonTime.format("YYYY-MM-DD");

  const hour = washingtonTime.hour();
  const latestTimeSlot =
    hour < 6 ? "00-06" : hour < 12 ? "06-12" : hour < 18 ? "12-18" : "18-24";

  const filtered = records.filter((r) => {
    const t = dayjs(r.date).tz("America/New_York");
    return (
      t.format("YYYY-MM-DD") === latestDate &&
      ((t.hour() < 6 && latestTimeSlot === "00-06") ||
        (t.hour() >= 6 && t.hour() < 12 && latestTimeSlot === "06-12") ||
        (t.hour() >= 12 && t.hour() < 18 && latestTimeSlot === "12-18") ||
        (t.hour() >= 18 && latestTimeSlot === "18-24"))
    );
  });

  let totalDistribution = 0;

  for (const r of filtered) {
    const base = await prisma.shopMetric.findFirst({
      where: {
        shopId: r.shopId,
        date: { lt: r.date },
        timeSlot: r.timeSlot,
        source: "average",
      },
      orderBy: { date: "desc" },
    });

    const dist = computeDistribution(r.popularity, base?.popularity ?? null);
    if (dist !== null) totalDistribution += dist;
  }

  const timeWeight = getTimeWeight(records[0].date);
  const finalPoint = Math.round(totalDistribution * timeWeight);

  await prisma.pointMetric.upsert({
    where: {
      date_timeSlot: {
        date: new Date(latestDate),
        timeSlot: latestTimeSlot,
      },
    },
    update: { point: finalPoint },
    create: {
      date: new Date(latestDate),
      timeSlot: latestTimeSlot,
      point: finalPoint,
    },
  });

  console.log(
    `✅ 포인트 저장 완료: [워싱턴 기준] ${latestDate} ${latestTimeSlot} → ${finalPoint}`
  );
}

module.exports = { savePointToDB };
