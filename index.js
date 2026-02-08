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
  const incomingMsg = req.body.Body;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful, polite WhatsApp assistant.",
        },
        {
          role: "user",
          content: incomingMsg,
        },
      ],
      max_tokens: 150,
    });

    const aiReply = response.choices[0].message.content;

    res.set("Content-Type", "text/xml");
    res.send(`
      <Response>
        <Message>${aiReply}</Message>
      </Response>
    `);
  } catch (error) {
    console.error(error);
    res.send(`
      <Response>
        <Message>Sorry, something went wrong.</Message>
      </Response>
    `);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
