import { MongoClient } from "mongodb";
import { randomInt } from "node:crypto";

const CAMPAIGN_ID = "soundhub-food-good-v1";

const VOUCHERS = [
  { value: 100000, label: "100K", probability: 60 },
  { value: 200000, label: "200K", probability: 15 },
  { value: 300000, label: "300K", probability: 10 },
  { value: 400000, label: "400K", probability: 10 },
  { value: 500000, label: "500K", probability: 5 },
];

async function getSpinsCollection() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Chưa cấu hình MONGODB_URI.");
  }

  if (!globalThis.mongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    globalThis.mongoClientPromise = client.connect();
  }

  const client = await globalThis.mongoClientPromise;

  return client
    .db("soundhub_voucher")
    .collection("spins");
}

function normalizePhone(input) {
  let phone = String(input ?? "").replace(/\D/g, "");

  if (phone.startsWith("84") && phone.length === 11) {
    phone = "0" + phone.slice(2);
  }

  if (!/^0\d{9}$/.test(phone)) {
    throw new Error("Vui lòng nhập số điện thoại Việt Nam hợp lệ.");
  }

  return phone;
}

function pickVoucher() {
  const roll = randomInt(100);
  let total = 0;

  for (const voucher of VOUCHERS) {
    total += voucher.probability;
    if (roll < total) return voucher;
  }

  return VOUCHERS[VOUCHERS.length - 1];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chỉ hỗ trợ POST." });
  }

  try {
    const { action, phone: inputPhone } = req.body ?? {};
    const phone = normalizePhone(inputPhone);
    const spins = await getSpinsCollection();

    await spins.createIndex(
      { campaignId: 1, phone: 1 },
      { unique: true }
    );

    if (action === "check") {
      const existing = await spins.findOne({
        campaignId: CAMPAIGN_ID,
        phone,
      });

      return res.status(200).json({
        alreadyPlayed: Boolean(existing),
        result: existing
          ? { value: existing.value, label: existing.label }
          : null,
      });
    }

    if (action === "spin") {
      const voucher = pickVoucher();

      try {
        await spins.insertOne({
          campaignId: CAMPAIGN_ID,
          phone,
          value: voucher.value,
          label: voucher.label,
          createdAt: new Date(),
        });

        return res.status(200).json({
          alreadyPlayed: false,
          result: { value: voucher.value, label: voucher.label },
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;

        const existing = await spins.findOne({
          campaignId: CAMPAIGN_ID,
          phone,
        });

        return res.status(200).json({
          alreadyPlayed: true,
          result: existing
            ? { value: existing.value, label: existing.label }
            : null,
        });
      }
    }

    return res.status(400).json({ error: "Yêu cầu không hợp lệ." });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message || "Không xử lý được yêu cầu.",
    });
  }
}