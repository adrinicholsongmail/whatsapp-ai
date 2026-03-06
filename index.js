import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const DRIVER_NUMBER = "whatsapp:+966XXXXXXXXX"; // Replace with your driver’s WhatsApp

// ===== STORED RESPONSES =====
const storedResponses = {
  price: "Our prices are:\n60 min – 250 SAR\n90 min – 350 SAR\n120 min – 450 SAR",
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

  return data.length < 6; // max 6 bookings per therapist per day
}

// ===== LOG BOOKING =====
async function logBooking(data) {
  await supabase.from("bookings").insert([data]);
}

// ===== VOICE NOTE TRANSCRIPTION =====
async function transcribeVoice(mediaUrl){
  const response = await axios.get(mediaUrl, { responseType:'arraybuffer' });
  const audio = Buffer.from(response.data);
  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: "gpt-4o-transcribe"
  });
  return transcription.text;
}

// ===== PARSE LOCATION =====
function parseLocation(req){
  if(req.body.Latitude){
    return {
      lat: req.body.Latitude,
      lng: req.body.Longitude,
      address: req.body.Address
    };
  }
  return null;
}

// ===== AI INTENT DETECTION =====
async function understandIntent(message){
  const prompt = `
You are a Saudi WhatsApp massage booking receptionist for Revive Massage.

Extract JSON with:
service, duration, time, intent

Intent can be: book, cancel, reschedule, question

Message: ${message}
Return JSON only.
`;

  const response = await openai.chat.completions.create({
    model:"gpt-4o-mini",
    messages:[{role:"user",content:prompt}]
  });

  return JSON.parse(response.choices[0].message.content);
}

// ===== DRIVER NOTIFICATION =====
async function notifyDriver(service, time, address){
  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: DRIVER_NUMBER,
    body: `
🚗 New Pickup

Service: ${service}
Time: ${time}

Location:
${address}
`
  });
}

// ===== CONFIRM BOOKING =====
async function confirmBooking(details){
  const repeat = await isRepeatCustomer(details.phone);
  const available = await therapistAvailable(details.therapist);

  if(!available){
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

// ===== CANCEL BOOKING =====
async function cancelBooking(phone){
  await supabase.from("bookings")
    .update({ status: "cancelled" })
    .eq("phone", phone)
    .eq("status","confirmed");
}

// ===== WEBHOOK =====
app.post("/whatsapp/webhook", async(req,res)=>{
  let message = req.body.Body || "";
  const phone = req.body.From;

  const language = detectLanguage(message);

  const stored = checkStoredResponse(message);
  if(stored){
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: phone,
      body: stored
    });
    return res.sendStatus(200);
  }

  if(req.body.NumMedia > 0){
    const mediaUrl = req.body.MediaUrl0;
    message = await transcribeVoice(mediaUrl);
  }

  const location = parseLocation(req);
  const intent = await understandIntent(message);

  if(intent.intent === "cancel"){
    await cancelBooking(phone);
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: phone,
      body: "Your appointment has been cancelled."
    });
    return res.sendStatus(200);
  }

  if(location){
    await logBooking({
      customer_name: intent.customer_name || "",
      phone,
      service: intent.service,
      duration: intent.duration,
      time: intent.time,
      address: location.address,
      lat: location.lat,
      lng: location.lng,
      status: "confirmed"
    });

    await notifyDriver(intent.service,intent.time,location.address);

    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: phone,
      body: `
✅ Your session is confirmed

Service: ${intent.service}
Time: ${intent.time}

Our therapist is on the way.

Thank you for choosing Revive Massage Therapy.
`
    });

    return res.sendStatus(200);
  }

  // Ask for location if not received yet
  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: phone,
    body: "Please send your location to confirm the booking."
  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("Server running"));