import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("WhatsApp AI server is running ✅");
});

app.post("/whatsapp", async (req, res) => {
  try {
    console.log("📩 Webhook hit");

    const incomingMsg = req.body.Body || "";
    console.log("📨 Incoming message:", incomingMsg);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are the WhatsApp booking assistant for Revive Massage Company in Jubail, Saudi Arabia.

Speak in natural Saudi dialect Arabic.
Be calm, confident, short, and direct.
Do not send long paragraphs.
Do not repeat greetings.
Move quickly toward booking.

Prices (SAR):
60 min = 190
75 min = 220
90 min = 240
Couples 60 min = 300

If customer negotiates price:
Reply: "هذه أسعارنا الحالية. إذا حاب تحجز نثبت لك الموعد."

Recommend:
Pain → Therapeutic
Stress → Relaxation
Gym soreness → Sports
After surgery → Lymphatic

Ask for:
Location pin
House/building number
Preferred time

Keep replies short.
`
        },
        {
          role: "user",
          content: incomingMsg,
        },
      ],
    });

    const reply =
      completion.choices[0].message.content.trim();

    console.log("🤖 AI reply:", reply);

    res.send(
      `<Response><Message>${reply}</Message></Response>`
    );
  } catch (err) {
    console.error("❌ OpenAI ERROR:", err);
    res.send(
      `<Response><Message>Sorry, something went wrong.</Message></Response>`
    );
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
