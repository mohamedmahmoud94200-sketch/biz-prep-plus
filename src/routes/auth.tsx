import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("أهلاً / Welcome");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f5] px-4" dir="rtl">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold">Proforma Admin</h1>
          <p className="mt-1 text-xs text-muted-foreground">تسجيل دخول الأدمن — Sign in</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Email / البريد</label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Password / كلمة المرور</label>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-[#2BB39B] hover:bg-[#249e88]">
          {loading ? "..." : "دخول / Sign in"}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          الحسابات يضيفها الأدمن من لوحة التحكم فقط.
        </p>
      </form>
    </div>
  );
}