import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    const dbStatus = 'connected';

    // Check gateway connectivity
    let gatewayStatus = 'unreachable';
    try {
      const res = await fetch('http://localhost:18791/api/health', {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        gatewayStatus = 'connected';
      }
    } catch {}

    return NextResponse.json({
      status: 'ok',
      database: dbStatus,
      gateway: gatewayStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        gateway: 'unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
