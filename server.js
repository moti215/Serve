const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

app.post('/whatsapp-webhook', async (req, res) => {
    const userMessage = req.body.Body;
    console.log("Received WhatsApp Message:", userMessage);
    
    if (!userMessage) {
        return res.status(200).send('<Response></Response>');
    }

    try {
        const prompt = `
        You are an AI assistant for a Contact Map app. Parse the user's request into a strict JSON command matching one of these actions:
        - action: "savePerson", payload: { name, phone, email, tags, notes, homeNew }
        - action: "logVisit", payload: { placeId, season, date (YYYY-MM-DD), notes }
        - action: "getContactsData", payload: {}
        
        User request: "${userMessage}"
        Current Date: ${new Date().toISOString().split('T')[0]}
        
        Return ONLY valid JSON with keys "action" and "payload". Do not wrap in markdown or backticks.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let commandText = response.text ? response.text.trim() : '';
        console.log("AI Output:", commandText);

        commandText = commandText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        const command = JSON.parse(commandText);

        // Send to Google Apps Script
        const gasResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        });
        
        const gasResult = await gasResponse.json();
        console.log("Apps Script Output:", gasResult);

        const replyText = gasResult.status === 'success' 
            ? `Success! ${gasResult.message || 'Action performed.'}` 
            : `App Error: ${gasResult.message}`;

        res.set('Content-Type', 'text/xml');
        res.send(`<Response><Message>${replyText}</Message></Response>`);

    } catch (error) {
        console.error("Webhook Error:", error);
        res.set('Content-Type', 'text/xml');
        res.send(`<Response><Message>Error: ${error.message}</Message></Response>`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
