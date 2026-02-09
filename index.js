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

    const incomingMsg =
      req.body.Body ||
      req.body.message ||
      "";

    console.log("📨 Incoming message:", incomingMsg);

    console.log(
      "🔑 OpenAI key exists:",
      !!process.env.OPENAI_API_KEY
    );

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OpenAI API Key");
    }

    // TEMP RESPONSE (no OpenAI yet)
    res.send(
      `<Response><Message>Message received: ${incomingMsg}</Message></Response>`
    );

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.send(
      `<Response><Message>Sorry, something went wrong.</Message></Response>`
    );
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
