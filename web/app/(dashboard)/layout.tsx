import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandBar } from '@/components/layout/command-bar';
import { StoreProvider } from '@/components/providers/store-provider';
import { SWRProvider } from '@/components/providers/swr-provider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRProvider>
      <StoreProvider>
        <div className="h-screen flex">
          <Sidebar />
          <div className="flex-1 flex flex-col ml-64">
            <Header />
            <main className="flex-1 overflow-y-auto bg-muted/40 pb-16">
              <div className="container mx-auto p-6">
                {children}
              </div>
            </main>
            <CommandBar />
          </div>
        </div>
      </StoreProvider>
    </SWRProvider>
  );
}
