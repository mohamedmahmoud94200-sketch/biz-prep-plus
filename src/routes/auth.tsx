import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | Proforma Admin" },
      { name: "description", content: "Sign in to create, manage, and export your professional proforma invoices." },
      { property: "og:title", content: "Sign in | Proforma Admin" },
      { property: "og:description", content: "Sign in to create, manage, and export your professional proforma invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("تم إنشاء الحساب / Account created");
      navigate({ to: "/" });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("أهلاً / Welcome");
      navigate({ to: "/" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f5] px-4" dir="rtl">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold">Proforma Admin</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "signin" ? "تسجيل دخول — Sign in" : "إنشاء حساب — Create account"}
          </p>
        </div>
        <div className="flex rounded-md border p-1 text-xs">
          <button type="button" onClick={() => setMode("signin")}
            className={`flex-1 rounded py-1.5 ${mode === "signin" ? "bg-[#2BB39B] text-white" : "text-muted-foreground"}`}>
            دخول / Sign in
          </button>
          <button type="button" onClick={() => setMode("signup")}
            className={`flex-1 rounded py-1.5 ${mode === "signup" ? "bg-[#2BB39B] text-white" : "text-muted-foreground"}`}>
            تسجيل / Sign up
          </button>
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
          {loading ? "..." : mode === "signin" ? "دخول / Sign in" : "تسجيل / Sign up"}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          أي حد بإيميل يقدر يدخل ويعدّل.
        </p>
      </form>
    </div>
  );
}