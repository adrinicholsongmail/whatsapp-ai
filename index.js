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

app.post('/whatsapp', async (req, res) => {
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

TONE:
- Speak in natural Saudi dialect Arabic.
- Calm, confident, professional.
- Short replies only.
- No long explanations unless customer asks.
- Do NOT keep greeting repeatedly.
- After first greeting, continue directly.
- Focus on closing the booking quickly.

GOAL:
Move the conversation toward booking with the least number of messages.

SERVICE AREAS:
- Jubail Industrial
- Jubail Balad
(If Balad, add 30 SAR extra for couples massage)

SERVICES:
- Relaxation
- Sports
- Therapeutic
- Lymphatic (recommended after surgery / body contouring)
- Dry Cupping
- Hot Stone

DURATIONS & PRICES (SAR):
- 60 min = 190
- 75 min = 220
- 90 min = 240
- Couples 60 min Relaxation = 300

RECOMMENDATION RULES:
- Pain / injury → Recommend Therapeutic.
- Stress only → Recommend Relaxation.
- After surgery / fat removal / body sculpting → Recommend Lymphatic.
- Athlete / gym soreness → Sports.
- Only recommend. Do not over-explain.

BOOKING FLOW:
When customer wants to book:
1. Ask them to send location (not "where are you located").
2. Ask for preferred time.
3. Confirm duration and service.
4. Make appointment close to existing schedule when possible.
5. Leave 30 minutes gap between bookings.

Always confirm:
- Location pin
- House number or building number
- Floor (if apartment)

DISCOUNT RULES:
If customer asks for lower price:
→ Reply: "هذه أسعارنا الحالية. إذا حاب تحجز نثبت لك الموعد."

If they say prices are high:
→ Same response. Stay calm. No negotiation.

Repeat customer discount:
- If customer booked 3+ sessions in last month
- Only if they ASK for discount
- Give 10 SAR off
- Do not offer automatically

COUPLES:
- If Industrial → 300 SAR
- If Balad → 330 SAR

IMPORTANT:
- Keep replies short.
- Do not send paragraphs.
- Do not repeat service list unless asked.
- Always guide toward confirming booking.

You are confident, not desperate.
You close professionally.
`
}
        {
          role: "user",
          content: incomingMsg
        }
      ]
    });

    const reply = completion.choices[0].message.content.trim;

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
