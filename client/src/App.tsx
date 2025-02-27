import React, { Suspense, useEffect } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import AuthPage from "@/pages/auth-page";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminLessons from "@/pages/admin/lessons";
import StudentDashboard from "@/pages/student/dashboard";
import Flashcard from "@/pages/student/flashcard";
import NotFound from "@/pages/not-found";
import { useToast } from "@/hooks/use-toast";

function Router() {
  const { user, isLoading, logout } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "退出成功",
        description: "您已成功退出账户"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "退出失败",
        description: "退出账户时发生错误"
      });
    }
  };

  // 检查是否需要重定向
  useEffect(() => {
    const redirectTo = sessionStorage.getItem('redirectTo');
    if (redirectTo) {
      sessionStorage.removeItem('redirectTo');
      setLocation(redirectTo);
    }
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, show auth page
  if (!user) {
    return <AuthPage />;
  }

  console.log("Current user:", user); // Add logging to debug

  // Show admin or student routes based on user role
  return (
    <div>
      {/* Header with logout button */}
      <header className="bg-background border-b py-4 px-6 flex justify-between items-center">
        <Link href="/" className="flex flex-col items-center">
          <img src="/logo.png" alt="Logo" className="w-28 h-auto mb-0.5" />
          <span className="text-xl font-semibold hover:opacity-80">智慧树语言中心</span>
        </Link>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          退出账户
        </Button>
      </header>

      {/* Main content */}
      <main className="p-6">
        <Suspense fallback={<div>Loading...</div>}>
          <Switch>
            {user.isAdmin ? (
              <>
                <Route path="/" component={AdminDashboard} />
                <Route path="/lessons" component={AdminLessons} />
                <Route path="/files" component={React.lazy(() => import('@/pages/admin/files'))} />
                <Route path="/dashboard" component={AdminDashboard} />
              </>
            ) : (
              <>
                <Route path="/" component={StudentDashboard} />
                <Route path="/lesson/:id" component={Flashcard} />
                <Route path="/lesson/:id/review" component={Flashcard} />
                <Route path="/files" component={React.lazy(() => import('@/pages/student/files'))} />
                <Route path="/dashboard" component={StudentDashboard} />
              </>
            )}
          </Switch>
        </Suspense>
      </main>
    </div>
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