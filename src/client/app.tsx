import { AppContext } from "./context";
import { useAppState } from "./hooks/use-app";
import { useRouter } from "./hooks/use-router";
import { Sidebar } from "./components/sidebar";
import { ErrorBanner } from "./components/error-banner";
import { Dashboard } from "./components/dashboard";
import { PostComposer } from "./components/post-composer";
import { CalendarView } from "./components/calendar-view";
import { QueueView } from "./components/queue-view";
import { DraftsView } from "./components/drafts-view";
import { ChannelList } from "./components/channel-list";
import { AnalyticsView } from "./components/analytics-view";

export function App() {
  const appState = useAppState();
  const { view, editId, navigate } = useRouter();

  const renderMain = () => {
    switch (view) {
      case "compose": return <PostComposer editId={editId} navigate={navigate} />;
      case "calendar": return <CalendarView navigate={navigate} />;
      case "queue": return <QueueView navigate={navigate} />;
      case "drafts": return <DraftsView navigate={navigate} />;
      case "channels": return <ChannelList />;
      case "analytics": return <AnalyticsView />;
      default: return <Dashboard navigate={navigate} />;
    }
  };

  return (
    <AppContext.Provider value={appState}>
      <div class="flex min-h-screen">
        <Sidebar currentView={view} navigate={navigate} />
        <main class="flex-1 overflow-auto min-w-0">
          {appState.loading ? (
            <div class="flex items-center justify-center h-full">
              <p class="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            renderMain()
          )}
        </main>
      </div>
      <ErrorBanner />
    </AppContext.Provider>
  );
}
