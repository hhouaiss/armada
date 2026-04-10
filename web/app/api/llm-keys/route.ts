import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

// Encryption utilities (mirrored from gateway)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32),
    iv
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32),
    iv
  );
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET - List all configured API keys (masked)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userWithKeys = await prisma.user.findUnique({
      where: { id: user.id },
      include: { llmApiKeys: true },
    });

    if (!userWithKeys) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Return masked keys
    const maskedKeys = userWithKeys.llmApiKeys.map(key => ({
      provider: key.provider,
      isActive: key.isActive,
      maskedKey: maskApiKey(decrypt(key.apiKey)),
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));

    return NextResponse.json({ keys: maskedKeys });
  } catch (error) {
    console.error('Error fetching LLM keys:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

// POST - Add or update API key
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'Provider and API key are required' }, { status: 400 });
    }

    // Validate provider
    const validProviders = ['anthropic', 'openai', 'openrouter', 'gemini', 'groq', 'together', 'moonshot', 'minimax', 'ollama'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Encrypt the API key
    const encryptedKey = encrypt(apiKey);

    // Upsert the key
    const llmKey = await prisma.lLMApiKey.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider,
        },
      },
      create: {
        userId: user.id,
        provider,
        apiKey: encryptedKey,
        isActive: true,
      },
      update: {
        apiKey: encryptedKey,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      provider: llmKey.provider,
      maskedKey: maskApiKey(apiKey),
    });
  } catch (error) {
    console.error('Error saving LLM key:', error);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}

// DELETE - Remove API key
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    await prisma.lLMApiKey.delete({
      where: {
        userId_provider: {
          userId: user.id,
          provider,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting LLM key:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 4) return '****';
  return '•'.repeat(key.length - 4) + key.slice(-4);
}
