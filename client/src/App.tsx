import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/auth-page";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminLessons from "@/pages/admin/lessons";
import StudentDashboard from "@/pages/student/dashboard";
import Flashcard from "@/pages/student/flashcard";
import NotFound from "@/pages/not-found";

function Router() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Switch>
      {user.isAdmin ? (
        <>
          <Route path="/" component={AdminDashboard} />
          <Route path="/lessons" component={AdminLessons} />
        </>
      ) : (
        <>
          <Route path="/" component={StudentDashboard} />
          <Route path="/lesson/:id" component={Flashcard} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
