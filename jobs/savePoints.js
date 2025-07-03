const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { PrismaClient } = require("@prisma/client");

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

// ✅ 포인트 계산 → DB 저장 함수
async function savePointToDB() {
  const allRecords = await prisma.shopMetric.findMany({
    where: {
      source: { in: ["realtime", "average"] }, // source 상관 없이 모두 가져옴
    },
    orderBy: [{ date: "desc" }],
    take: 1000,
  });

  const latestRecord = allRecords[0];
  if (!latestRecord) {
    console.warn("⚠️ 혼잡도 기록 없음. 포인트 저장 건너뜀");
    return;
  }

  const washingtonTime = dayjs(latestRecord.date).tz("America/New_York");
  const latestDate = washingtonTime.format("YYYY-MM-DD");
  const hour = washingtonTime.hour();
  const latestTimeSlot =
    hour < 6 ? "00-06" : hour < 12 ? "06-12" : hour < 18 ? "12-18" : "18-24";

  const filtered = allRecords.filter((r) => {
    const t = dayjs(r.date).tz("America/New_York");
    const sameDate = t.format("YYYY-MM-DD") === latestDate;
    const inSlot =
      (t.hour() < 6 && latestTimeSlot === "00-06") ||
      (t.hour() >= 6 && t.hour() < 12 && latestTimeSlot === "06-12") ||
      (t.hour() >= 12 && t.hour() < 18 && latestTimeSlot === "12-18") ||
      (t.hour() >= 18 && latestTimeSlot === "18-24");
    return sameDate && inSlot;
  });

  // ✅ 단순히 모든 popularity 합산 (source 상관 없이)
  let finalPoint = 0;
  for (const record of filtered) {
    if (record.popularity !== null) {
      finalPoint += record.popularity;
    }
  }

  // ✅ 포인트 DB 저장
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
