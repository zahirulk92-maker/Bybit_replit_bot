import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertTriangle, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const loginSchema = z.object({
  username: z.string().min(2, { message: "Username must be at least 2 characters." }),
  password: z.string().min(4, { message: "Password must be at least 4 characters." }),
});

export default function Login() {
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "operator",
      password: "password123",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    console.log("Login:", values);
    setLocation("/dashboard");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
      
      <Card className="w-full max-w-md z-10 border-border bg-card/80 backdrop-blur shadow-xl">
        <CardHeader className="space-y-3 pb-6">
          <div className="flex items-center justify-center mb-2">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center shadow-lg">
              <Terminal className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center tracking-tight">BybitDemoBot <span className="text-muted-foreground text-lg">v2.1</span></CardTitle>
          <CardDescription className="text-center">
            Authenticate to operator console
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-md p-3 flex items-start space-x-3 text-amber-500 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-1">DEMO ENVIRONMENT</strong>
              This console is connected to Bybit Testnet. No real funds are at risk.
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Operator ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter username" {...field} className="font-mono bg-background" data-testid="input-username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passphrase</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter password" {...field} className="font-mono bg-background" data-testid="input-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-6" data-testid="button-login">
                Connect to DEMO
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
