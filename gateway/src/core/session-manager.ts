import { nanoid } from 'nanoid';
import { AgentSession } from '../types/agents.js';

export class SessionManager {
  private sessions: Map<string, AgentSession> = new Map();

  create(agentId: string, type: AgentSession['type']): AgentSession {
    const session: AgentSession = {
      id: nanoid(),
      agentId,
      type,
      status: 'active',
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(session.id, session);
    console.log(`→ Created ${type} session: ${session.id} for agent: ${agentId}`);
    return session;
  }

  get(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  update(sessionId: string, updates: Partial<AgentSession>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    Object.assign(session, {
      ...updates,
      lastActivityAt: new Date(),
    });
  }

  complete(sessionId: string, status: 'completed' | 'failed' = 'completed'): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      console.log(`✓ Session ${status}: ${sessionId}`);
    }
  }

  getByAgent(agentId: string): AgentSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.agentId === agentId && s.status === 'active'
    );
  }

  cleanup(maxAge: number = 3600000): void {
    // Clean up sessions older than maxAge (default 1 hour)
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (
        session.status !== 'active' &&
        now - session.lastActivityAt.getTime() > maxAge
      ) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old sessions`);
    }
  }
}
