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
          content:
            "You are a friendly Saudi-based massage booking assistant. Respond naturally in Saudi Arabic dialect."
        },
        {
          role: "user",
          content: incomingMsg
        }
      ]
    });

    const reply = completion.choices[0].message.content;

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
