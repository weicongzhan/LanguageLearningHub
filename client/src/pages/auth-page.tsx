import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

type FormData = {
  username: string;
  password: string;
};

export default function AuthPage() {
  const { login, register } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const loginForm = useForm<FormData>({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<FormData>({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleLogin = async (data: FormData) => {
    try {
      setIsLoading(true);
      const result = await login(data);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (data: FormData) => {
    try {
      setIsLoading(true);
      const result = await register(data);
      if (result.ok) {
        toast({
          title: "注册成功",
          description: "账户创建成功"
        });
      } else {
        toast({
          variant: "destructive",
          title: "注册失败",
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "错误",
        description: "发生意外错误",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold">
            智慧树语言中心
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <Input
                  placeholder="Username"
                  {...loginForm.register("username", { required: true })}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  {...loginForm.register("password", { required: true })}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Login
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <Input
                  placeholder="Username"
                  {...registerForm.register("username", { required: true })}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  {...registerForm.register("password", { required: true })}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Register
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
