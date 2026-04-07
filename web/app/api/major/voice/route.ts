import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY manquante' }, { status: 500 });
  }

  const { audioBase64, mimeType } = await req.json();
  if (!audioBase64) {
    return Response.json({ error: 'Audio manquant' }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    },
    `Tu es Le Major, chef des opérations d'Armada HQ. Tu coordonnes une escouade d'agents IA pour gérer les opérations business.
Réponds à cette commande vocale de façon concise, directe et militaire. Maximum 2-3 phrases. Réponds en français.`,
  ]);

  return Response.json({ text: result.response.text() });
}
