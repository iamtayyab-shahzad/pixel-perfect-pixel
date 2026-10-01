import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/services/staff.functions";
import { PageHeader } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in — CoolFlow HVAC" },
      { name: "description", content: "Sign in for CoolFlow HVAC owners and technicians." },
      { property: "og:title", content: "Staff sign in — CoolFlow HVAC" },
      { property: "og:description", content: "Owner dispatch and technician job tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const DEMO = [
  ["mike@coolflow.demo", "Mike — owner"],
  ["daniel@coolflow.demo", "Daniel — technician"],
  ["sarah@coolflow.demo", "Sarah — technician"],
] as const;

function AuthPage() {
  const nav = useNavigate();
  const me = useServerFn(getMe);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setError("That email and password don't match a staff account."); return; }
    try {
      const r = await me();
      if (r.isOwner) await nav({ to: "/owner" });
      else if (r.isTech) await nav({ to: "/tech" });
      else {
        await supabase.auth.signOut();
        setError("This account isn't on the CoolFlow team. Ask the owner to add your email.");
      }
    } catch {
      setError("Signed in, but we couldn't load your access. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <PageHeader eyebrow="Staff" title="Sign in" description="For the CoolFlow owner and technicians. Customers don't need an account." />
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></div>
        <div className="grid gap-1.5"><Label htmlFor="pw">Password</Label>
          <Input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <div className="mt-8 rounded-xl border bg-card p-4 text-sm">
        <p className="eyebrow mb-2">Demo accounts</p>
        <p className="mb-2 text-muted-foreground">Password for all: <span className="font-mono">CoolFlow-Demo-2026</span></p>
        <div className="grid gap-1.5">
          {DEMO.map(([e, l]) => (
            <button key={e} type="button" onClick={() => { setEmail(e); setPassword("CoolFlow-Demo-2026"); }}
              className="flex min-h-11 items-center justify-between rounded-md border px-3 text-left hover:border-primary">
              <span>{l}</span><span className="font-mono text-xs text-muted-foreground">{e}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
