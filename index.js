import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ===== TWILIO SETUP =====
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const DRIVER_NUMBER = "whatsapp:+9660597046702"; // ← replace with driver number

// ===== STORED RESPONSES =====
const storedResponses = {
  price: "الأسعار:\n60 دقيقة – 250 ريال\n90 دقيقة – 350 ريال\n120 دقيقة – 450 ريال",
  location: "نقدم خدمة مساج منزلي. أرسل موقعك لو سمحت.",
  hours: "الحجوزات من 12 ظهرًا إلى 10:30 مساءً.",
  types: "نقدم: استرخائي، رياضي، علاجي، لمفاوي، حجامة."
};

// ===== LANGUAGE DETECTION =====
function detectLanguage(text) {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text) ? "ar" : "en";
}

// ===== CHECK STORED RESPONSES =====
function checkStoredResponse(message) {
  const msg = message.toLowerCase();
  if (msg.includes("price")) return storedResponses.price;
  if (msg.includes("where") || msg.includes("location")) return storedResponses.location;
  if (msg.includes("time") || msg.includes("hours")) return storedResponses.hours;
  if (msg.includes("types")) return storedResponses.types;
  return null;
}

// ===== REPEAT CUSTOMER =====
async function isRepeatCustomer(phone) {
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .eq("phone", phone)
    .limit(1);

  return data && data.length > 0;
}

// ===== THERAPIST DAILY LIMIT =====
async function therapistAvailable(name) {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("bookings")
    .select("id")
    .eq("therapist", name)
    .gte("created_at", today);

  return data.length < 6;
}

// ===== LOG BOOKING =====
async function logBooking(data) {
  await supabase.from("bookings").insert([data]);
}

// ===== SEND DRIVER NOTIFICATION =====
async function notifyDriver(details) {
  const message = `
🚗 *حجز جديد*


📍 المنطقة: ${details.area}
🏠 العنوان: ${details.address}

⏰ الوقت: ${details.time}

⏳ المدة: ${details.duration} دقيقة


${details.mapLink ? `📍 الخريطة: ${details.mapLink}` : ""}
`;

  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: DRIVER_NUMBER,
    body: message
  });
}

// ===== CONFIRM BOOKING =====
async function confirmBooking(details) {
  const repeat = await isRepeatCustomer(details.phone);
  const available = await therapistAvailable(details.therapist);

  if (!available) {
    return "المعالج ممتلئ اليوم. اختر وقت آخر.";
  }

  await logBooking({
    customer_name: details.name,
    phone: details.phone,
    area: details.area,
    address: details.address,
    duration: details.duration,
    therapist: details.therapist,
    price: details.price,
    status: "confirmed"
  });

  await notifyDriver(details);

  return repeat
    ? "تم تأكيد حجزك. نورتنا مرة ثانية 🙏"
    : "تم تأكيد الحجز. نشوفك على خير 🙏";
}

// ===== WEBHOOK =====
app.post("/whatsapp/webhook", async (req, res) => {
  const incomingMsg = req.body.Body;
  const phone = req.body.From;

  const latitude = req.body.Latitude;
  const longitude = req.body.Longitude;

  const language = detectLanguage(incomingMsg || "");

  // STORED RESPONSES
  const stored = checkStoredResponse(incomingMsg || "");
  if (stored) {
    res.type("text/xml");
    return res.send(`<Response><Message>${stored}</Message></Response>`);
  }

  const systemPrompt = `
You are a professional Saudi home massage booking assistant.

Speak in natural Saudi Arabic.
Sound warm, confident, and human.
Do not repeat greetings.
Keep replies short.

Services:
Relaxation, Sports, Therapeutic, Lymphatic, Hijama

Prices:
60m – 250 SAR
90m – 350 SAR
120m – 450 SAR

Always guide toward booking.
Ask for location and preferred time early.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "assistant", content: "Continue the conversation naturally." },
      { role: "user", content: incomingMsg }
    ]
  });

  const aiReply = completion.choices[0].message.content;

  res.type("text/xml");
  res.send(`<Response><Message>${aiReply}</Message></Response>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));