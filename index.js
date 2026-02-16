import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple in-memory session storage
const sessions = {};

app.get("/", (req, res) => {
  res.send("WhatsApp AI server is running ✅");
});

// Detect Arabic
function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

// Human typing delay
function getTypingDelay(text) {
  const words = text.split(" ").length;
  if (words <= 3) return 800;
  if (words <= 8) return 1500;
  if (words <= 15) return 2500;
  return 3500;
}

app.post("/whatsapp", async (req, res) => {
  try {
    const incomingMsg = req.body.Body || "";
    const from = req.body.From;

    if (!sessions[from]) {
      sessions[from] = { aiActive: true };
    }

    const lowerMsg = incomingMsg.toLowerCase();

    console.log("📨 From:", from);
    console.log("💬 Message:", incomingMsg);

    // ===============================
    // ADMIN COMMANDS (Hidden)
    // ===============================

    if (lowerMsg === "/takeover") {
      sessions[from].aiActive = false;
      console.log("⏸ AI paused for", from);
      return res.send("<Response></Response>");
    }

    if (lowerMsg === "/resume") {
      sessions[from].aiActive = true;
      console.log("▶ AI resumed for", from);
      return res.send("<Response></Response>");
    }

    // If AI paused → do nothing
    if (!sessions[from].aiActive) {
      console.log("⏸ AI currently paused.");
      return res.send("<Response></Response>");
    }

    // ===============================
    // HARD AREA RULES
    // ===============================

    if (lowerMsg.includes("qaidah")) {
      return res.send(
        `<Response><Message>Sorry, we don’t service Qaidah area.</Message></Response>`
      );
    }

    if (lowerMsg.includes("jubail balad")) {
      sessions[from].aiActive = false; // auto pause
      return res.send(
        `<Response><Message>Let me check availability and confirm shortly.</Message></Response>`
      );
    }

    // Offer direct response (skip AI)
    if (lowerMsg.includes("offer") || lowerMsg.includes("عرض")) {
      return res.send(
        `<Response><Message>
60 min – 250 SAR
90 min – 350 SAR
120 min – 450 SAR
</Message></Response>`
      );
    }

    // ===============================
    // OPENAI RESPONSE
    // ===============================

    const systemPrompt = `
You are a real human Saudi home massage booking assistant.

TONE:
- Calm
- Neutral
- Natural
- No exaggeration
- No "ممتاز", "Excellent", "Perfect" unless truly appropriate
- Do not react emotionally to normal info

STYLE:
- Short replies
- 1-2 sentences max
- If few words enough, use them
- No robotic structure
- No restarting conversation

LANGUAGE:
- Match customer language exactly

SERVICE:
- Home massage for men
- 60 = 250 SAR
- 90 = 350 SAR
- 120 = 450 SAR

AREAS:
- Jubail Industrial → normal booking
- Jubail Balad → say checking availability (no confirmation)
- Qaidah → not serviced

FLOW:
- Booking intent → "Share your location please."
- If no house/apartment number → ask for it
- If provided → ask preferred time
- Do not push booking when answering offer questions

GOAL:
Be efficient.
Be human.
Close booking naturally.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: incomingMsg },
      ],
      temperature: 0.5,
    });

    const reply = completion.choices[0].message.content.trim();

    const delay = getTypingDelay(reply);

    setTimeout(() => {
      res.send(`<Response><Message>${reply}</Message></Response>`);
    }, delay);

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.send(
      `<Response><Message>Sorry, something went wrong.</Message></Response>`
    );
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
