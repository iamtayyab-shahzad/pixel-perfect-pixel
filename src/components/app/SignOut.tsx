import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOut() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await supabase.auth.signOut();
        qc.clear();
        await nav({ to: "/auth" });
      }}
    >
      Sign out
    </Button>
  );
}
