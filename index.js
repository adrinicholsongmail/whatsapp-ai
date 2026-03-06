import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import axios from "axios";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const DRIVER_NUMBER = "whatsapp:+966XXXXXXXXX";


// ===== STORED RESPONSES =====
const storedResponses = {
  price: "Prices:\n60m – 250 SAR\n90m – 350 SAR\n120m – 450 SAR",
  location: "We provide home service massage. Please share your location.",
  hours: "Bookings available from 12:00 PM until 10:30 PM.",
  types: "Services: Relaxation, Sports, Therapeutic, Lymphatic, Hijama."
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
  if (msg.includes("types") || msg.includes("massage")) return storedResponses.types;

  return null;
}


// ===== REPEAT CUSTOMER CHECK =====
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


// ===== LOCATION PARSER =====
function parseLocation(req) {

  if (req.body.Latitude && req.body.Longitude) {
    return {
      lat: req.body.Latitude,
      lng: req.body.Longitude,
      address: req.body.Address || "Shared WhatsApp location"
    };
  }

  return null;
}


// ===== LOG BOOKING =====
async function logBooking(data) {

  await supabase.from("bookings").insert([data]);

}


// ===== SEND DRIVER MESSAGE =====
async function notifyDriver(booking) {

  const message = `🚗 New Massage Delivery

📍 Location:
${booking.address}

⏰ Time:
${booking.appointment_time}

⏱ Duration:
${booking.duration} minutes

💆 Therapist:
${booking.therapist}`;

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: DRIVER_NUMBER,
    body: message
  });

}


// ===== VOICE NOTE TRANSCRIPTION =====
async function transcribeVoice(mediaUrl) {

  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN
    }
  });

  const transcription = await openai.audio.transcriptions.create({
    file: Buffer.from(response.data),
    model: "whisper-1"
  });

  return transcription.text;
}


// ===== WEBHOOK =====
app.post("/whatsapp/webhook", async (req, res) => {

  let incomingMsg = req.body.Body || "";
  const phone = req.body.From;

  // ===== HANDLE VOICE NOTES =====
  if (req.body.NumMedia > 0 && req.body.MediaContentType0.includes("audio")) {

    const mediaUrl = req.body.MediaUrl0;

    incomingMsg = await transcribeVoice(mediaUrl);

  }

  const location = parseLocation(req);

  const language = detectLanguage(incomingMsg);


  // ===== STORED RESPONSES =====
  const stored = checkStoredResponse(incomingMsg);

  if (stored) {
    return res.send(`<Response><Message>${stored}</Message></Response>`);
  }


  // ===== AI PROMPT =====
  const systemPrompt = `

You are a Saudi professional WhatsApp massage booking assistant for a company called Revive Massage.

Speak in natural Saudi Arabic.
Sound warm, confident, and human.

Never repeat greetings.

Focus ONLY on massage services and booking.

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

Booking process order:
1 Ask massage type
2 Ask duration
3 Ask preferred time
4 Ask therapist preference
5 Ask customer to share location

Only confirm booking AFTER location is received.

Ask about pain/injury before recommending service.

Keep replies short.

Goal: guide customer step-by-step to complete the booking.

`;

  const completion = await openai.chat.completions.create({

    model: "gpt-4o-mini",

    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: incomingMsg }
    ]

  });

  const aiReply = completion.choices[0].message.content;


  // ===== LOCATION TRIGGERS BOOKING =====
  if (location) {

    const booking = {

      customer_name: "",
      phone: phone,
      area: "",
      address: location.address,
      duration: 60,
      therapist: "Therapist Assigned",
      price: 250,
      status: "confirmed",
      lat: location.lat,
      lng: location.lng,
      appointment_time: "Pending",
      
    };

    await logBooking(booking);

    await notifyDriver(booking);

  }

  res.send(`<Response><Message>${aiReply}</Message></Response>`);

});


// ===== SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log("Server running"));