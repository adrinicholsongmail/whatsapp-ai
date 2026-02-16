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

// Helper function to detect Arabic
function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

// Human typing delay simulation
function getTypingDelay(text) {
  const words = text.split(" ").length;

  if (words <= 3) return 800;        // very short reply
  if (words <= 8) return 1500;       // short reply
  if (words <= 15) return 2500;      // medium reply
  return 3500;                       // longer reply
}

app.post("/whatsapp", async (req, res) => {
  try {
    console.log("📩 Webhook hit");

    const incomingMsg = req.body.Body || "";
    console.log("📨 Incoming message:", incomingMsg);

    const customerLanguage = isArabic(incomingMsg) ? "arabic" : "english";

    const systemPrompt = `
You are a real human Saudi home massage booking assistant.

CRITICAL RULES:
- Never sound like AI
- Never be overly professional
- Keep replies SHORT and natural
- 1-2 sentences max unless absolutely necessary
- If 1-2 words is enough, use it
- Sound casual and confident
- No long explanations
- No robotic structure

LANGUAGE RULE:
- If customer speaks Arabic → reply Arabic (Saudi dialect)
- If customer speaks English → reply English
- Always match their language

BUSINESS INFO:
- Home massage for men
- 60 min = 250 SAR
- 90 min = 350 SAR
- 120 min = 450 SAR
- Some areas +30 SAR delivery

SERVICE TYPES:
Relaxation
Sports
Therapeutic
Lymphatic
Hijama

RECOMMENDATION LOGIC:
- If stress only → Relaxation
- If pain/injury/surgery → Therapeutic
- Always casually ask if any pain or injury before confirming type

LOCATION FLOW:
- If booking intent → say: "Share your location please."
- Once location received:
   - If house/apartment number missing → ask for it
   - If included → move to asking preferred time
- Do NOT restart conversation after location is sent

DISCOUNTS:
- Only if customer asks
- First time: can give 20 SAR max
- Never sound desperate

GOAL:
Close booking smoothly.
Be natural.
Be human.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: incomingMsg,
        },
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content.trim();

    console.log("🤖 AI reply:", reply);

    // Simulate typing delay
    const delay = getTypingDelay(reply);

    setTimeout(() => {
      res.send(`<Response><Message>${reply}</Message></Response>`);
    }, delay);

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
