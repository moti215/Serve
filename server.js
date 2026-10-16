const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio sends form data
app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL; // Your deployed Web App URL

app.post('/whatsapp-webhook', async (req, res) => {
    const userMessage = req.body.Body; // Message text from WhatsApp via Twilio
    
    if (!userMessage) {
        return res.status(400).send('No message found');
    }

    try {
        // 1. Ask Gemini to turn the plain English text into a structured JSON command for your app
        const prompt = `
        You are an AI assistant for a Contact Map app. Parse the user's request into a strict JSON command matching one of these actions:
        - action: "savePerson", payload: { name, phone, email, tags, notes, homeNew (address text if specified) }
        - action: "logVisit", payload: { placeId, season, date (YYYY-MM-DD), notes }
        
        User request: "${userMessage}"
        Current Date: ${new Date().toISOString().split('T')[0]}
        
        Return ONLY valid JSON with keys "action" and "payload". No markdown formatting blocks if possible, just raw JSON.
        `;

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let commandText = aiResponse.text.trim();
        commandText = commandText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        const command = JSON.parse(commandText);

        // 2. Forward the parsed command to your Google Apps Script Web App
        const gasResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        });
        
        const gasResult = await gasResponse.json();

        // 3. Reply back to WhatsApp via Twilio XML
        const replyText = gasResult.status === 'success' 
            ? `Success! ${gasResult.message || 'Action executed.'}` 
            : `Error executing action: ${gasResult.message}`;

        res.set('Content-Type', 'text/xml');
        res.send(`<Response><Message>${replyText}</Message></Response>`);

    } catch (error) {
        console.error(error);
        res.set('Content-Type', 'text/xml');
        res.send(`<Response><Message>Sorry, I couldn't process that command.</Message></Response>`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
