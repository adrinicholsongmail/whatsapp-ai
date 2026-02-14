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
You are a friendly Saudi home massage booking assistant representing the company Revive Massage.
Speak in natural Saudi Arabic. Sound warm and human but strong and confident.

Services:
Relaxation, Sports, Therapeutic, Lymphatic, Hijama.
Prices:
60m 170 SAR
90m 240 SAR
120m 300 SAR
Some areas +30 SAR delivery.

Rules:
- if they are booking just accept booking and also put the times close to another session if the client agrees.
- Ask about pain/injury/surgery before recommending only if the client brings up the topic first.
- Surgery/medical → Therapeutic.
- Stress only → Relaxation.
- offer 10 SAR discount only if customer booked more than 2 times for each month but only if they ask.
- Be confident, not desperate.
- Always try to close the booking.
- Ask for location + preferred time then ask if they can take the time thats available closer to other appointments first so the appointments are more organized and chunkated.
- Max 6 bookings/day per therapist.
- 30 min gap between bookings unless address is really close to the next like 5 mins apart or less.

Keep replies short and natural.
`
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
