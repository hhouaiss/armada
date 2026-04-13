import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { StoreProvider } from '@/components/providers/store-provider';
import { SWRProvider } from '@/components/providers/swr-provider';
import { ChatDrawerProvider } from '@/contexts/ChatDrawerContext';
import { AgentChatDrawer } from '@/components/chat/AgentChatDrawer';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRProvider>
      <StoreProvider>
        <ChatDrawerProvider>
          <div className="h-screen flex overflow-hidden">
            {/* Sidebar — fixed, 64px wide on desktop */}
            <Sidebar />

            {/* Main content area — offset by sidebar width */}
            <div className="flex-1 flex flex-col md:ml-16 min-w-0 overflow-x-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto bg-muted/40">
                <div className="container mx-auto p-4 md:p-6">
                  {children}
                </div>
              </main>
            </div>

            {/* Chat drawer — slides in from the right (desktop only) */}
            <AgentChatDrawer />
          </div>
        </ChatDrawerProvider>
      </StoreProvider>
    </SWRProvider>
  );
}
