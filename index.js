const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to read incoming form data (Twilio sends form-encoded data)
app.use(bodyParser.urlencoded({ extended: false }));

// Health check (for browser / Railway)
app.get("/", (req, res) => {
  res.send("WhatsApp AI server is running ✅");
});

// Twilio webhook endpoint
app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  console.log("Message from:", from);
  console.log("Message text:", incomingMsg);

  // Simple reply for now
  const reply = `You said: "${incomingMsg}"`;

  // Twilio expects XML (TwiML)
  res.set("Content-Type", "text/xml");
  res.send(`
    <Response>
      <Message>${reply}</Message>
    </Response>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
