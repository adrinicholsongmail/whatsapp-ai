import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


// ===== STORED RESPONSES =====
const storedResponses = {
  price: "Our prices are:\n60 min – 300\n90 min – 450\n120 min – 600",
  location: "We provide home service massage. Please share your location.",
  hours: "You can book between 12:00 PM and 10:30 PM. Last booking is 10:30 PM.",
  types: "We offer Relaxation, Deep Tissue, Swedish, and Thai massage."
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
  if (msg.includes("types") || msg.includes("massage")) return storedResponses.types;

  return null;
}

// ===== REPEAT CUSTOMER DETECTION =====
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

  return data.length < 6; // max 6 bookings per day per therapist
}

// ===== LOG BOOKING =====
async function logBooking(data) {
  await supabase.from("bookings").insert([data]);
}

// ===== WEBHOOK =====
app.post("/whatsapp/webhook", async (req, res) => {
  const incomingMsg = req.body.Body;
  const phone = req.body.From;

  const language = detectLanguage(incomingMsg);

  // 1️⃣ STORED RESPONSES FIRST
  const stored = checkStoredResponse(incomingMsg);
  if (stored) {
    return res.send(`<Response><Message>${stored}</Message></Response>`);
  }

  // 2️⃣ AI RESPONSE
  const systemPrompt = `

You are a professional Saudi home massage booking assistant.

Speak in natural Saudi Arabic.
Sound warm, confident, and human.
Do not repeat greetings in every message.
Assume the conversation is ongoing.

Services:
Relaxation
Sports
Therapeutic
Lymphatic
Hijama

Prices:
60m – 250 SAR
90m – 350 SAR
120m – 450 SAR
Some areas +30 SAR delivery.

Smart Recommendation Rules:
- Always ask about pain, injury, or recent surgery before recommending.
- If surgery or medical recovery → recommend Therapeutic.
- If stress or general relaxation → recommend Relaxation.
- If muscle soreness from gym → recommend Sports.

Business Rules:
- Offer 20 SAR discount ONLY if first-time customer asks about discount.
- Offer small loyalty discount for repeat customers.
- Be confident. Never sound desperate.
- Keep responses short.
- Always guide toward closing the booking.
- Ask for location and preferred time early.
- Maximum 6 bookings per therapist per day.
- Maintain 30-minute gap between bookings.

Goal:
Lead the conversation step-by-step toward confirming the booking.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: incomingMsg }
    ]
  });

  const aiReply = completion.choices[0].message.content;

  res.send(`<Response><Message>${aiReply}</Message></Response>`);
});

// ===== CONFIRM BOOKING EXAMPLE FUNCTION =====
async function confirmBooking(details) {
  const repeat = await isRepeatCustomer(details.phone);

  const available = await therapistAvailable(details.therapist);
  if (!available) {
    return "Selected therapist is fully booked today. Please choose another time.";
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

  return repeat
    ? "Your booking is confirmed. Welcome back."
    : "Your booking is confirmed. We look forward to serving you.";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
