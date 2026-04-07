import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!storeId || !agentId) {
      return NextResponse.json(
        { error: 'storeId and agentId are required' },
        { status: 400 }
      );
    }

    // Fetch most-recent N messages (desc), then reverse for ascending display order
    const messages = await prisma.chatMessage.findMany({
      where: {
        storeId,
        agentId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId, agentId, content } = await request.json();

    if (!storeId || !agentId || !content) {
      return NextResponse.json(
        { error: 'storeId, agentId, and content are required' },
        { status: 400 }
      );
    }

    // Save user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        storeId,
        agentId,
        sender: 'user',
        content,
      },
    });

    // Here you would send to gateway and get agent response
    // For now, just return the user message

    return NextResponse.json({ message: userMessage });
  } catch (error) {
    console.error('Error creating chat message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
