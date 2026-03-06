import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Twilio credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Driver WhatsApp
const DRIVER_NUMBER = "whatsapp:+966XXXXXXXXX"; // change to driver number

// ===== STORED RESPONSES =====
const storedResponses = {
  price: "Our prices are:\n60 min – 250 SAR\n90 min – 350 SAR\n120 min – 450 SAR",
  location: "We provide home service massage. Please share your location.",
  hours: "You can book between 12:00 PM and 10:30 PM. Last booking is 10:30 PM.",
  types: "We offer Relaxation, Sports, Therapeutic, Lymphatic, and Hijama massage."
};

// ===== LANGUAGE DETECTION =====
function detectLanguage(text) {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text) ? "ar" : "en";
}

// ===== STORED RESPONSE CHECK =====
function checkStoredResponse(message) {
  const msg = message.toLowerCase();

  if (msg.includes("price")) return storedResponses.price;
  if (msg.includes("where") || msg.includes("location")) return storedResponses.location;
  if (msg.includes("time") || msg.includes("hours")) return storedResponses.hours;
  if (msg.includes("types")) return storedResponses.types;

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

  return data.length < 6;
}

// ===== LOG BOOKING =====
async function logBooking(data) {
  await supabase.from("bookings").insert([data]);
}

// ===== SEND DRIVER MESSAGE =====
async function notifyDriver(booking) {

  const message =
`🚗 NEW MASSAGE DELIVERY


Time: ${booking.time}
Duration: ${booking.duration}

Area: ${booking.area}
Address: ${booking.address}

Location:
${booking.location_link}`;

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    new URLSearchParams({
      From: "whatsapp:+14155238886",
      To: DRIVER_NUMBER,
      Body: message
    }),
    {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      }
    }
  );
}

// ===== TRANSCRIBE VOICE NOTE =====
async function transcribeVoice(mediaUrl) {

  const audio = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: {
      username: TWILIO_ACCOUNT_SID,
      password: TWILIO_AUTH_TOKEN
    }
  });

  const transcription = await openai.audio.transcriptions.create({
    file: Buffer.from(audio.data),
    model: "gpt-4o-mini-transcribe"
  });

  return transcription.text;
}

// ===== WEBHOOK =====
app.post("/whatsapp/webhook", async (req, res) => {

  let incomingMsg = req.body.Body || "";
  const phone = req.body.From;

  // ===== HANDLE VOICE NOTES =====
  if (req.body.NumMedia > 0) {

    const mediaType = req.body.MediaContentType0;

    if (mediaType.startsWith("audio")) {

      const mediaUrl = req.body.MediaUrl0;

      incomingMsg = await transcribeVoice(mediaUrl);

      console.log("Voice transcription:", incomingMsg);

    }

  }

  const language = detectLanguage(incomingMsg);

  // ===== STORED RESPONSES =====
  const stored = checkStoredResponse(incomingMsg);

  if (stored) {
    return res.send(`<Response><Message>${stored}</Message></Response>`);
  }

  // ===== AI SYSTEM PROMPT =====
  const systemPrompt = `

You are the booking assistant for Revive Massage.

Speak naturally in Saudi Arabic or English depending on customer language.

Never repeat greetings.

Focus ONLY on massage booking.

Services:
Relaxation
Sports
Therapeutic
Lymphatic
Hijama

Prices:
60 min 250 SAR
90 min 350 SAR
120 min 450 SAR
Some areas +30 SAR delivery

Rules:

Ask about pain, injury, or surgery before recommending.

If surgery → Therapeutic
If stress → Relaxation
If gym soreness → Sports

Keep replies short and human.

Always guide toward booking.

Ask for:
- location
- preferred time
- duration

Maximum 6 bookings per therapist daily.

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

// ===== CONFIRM BOOKING FUNCTION =====
async function confirmBooking(details) {

  const repeat = await isRepeatCustomer(details.phone);

  const available = await therapistAvailable(details.therapist);

  if (!available) {
    return "Selected therapist is fully booked today.";
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
    ? "Your booking is confirmed. Welcome back."
    : "Your booking is confirmed. See you soon.";
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log("Server running"));