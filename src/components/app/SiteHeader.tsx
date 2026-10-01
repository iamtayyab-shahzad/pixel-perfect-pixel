import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/services/staff.functions";
import { SignOut } from "@/components/app/SignOut";
import { Button } from "@/components/ui/button";

function Logo({ to = "/" as "/" | "/owner" | "/tech", label }: { to?: "/" | "/owner" | "/tech"; label?: string }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2" aria-label="CoolFlow HVAC home">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-mono text-[11px] font-medium text-primary-foreground">CF</span>
      <span className="truncate whitespace-nowrap font-semibold tracking-tight">
        CoolFlow<span className="hidden sm:inline"> HVAC</span>
      </span>
      {label && (
        <span className="ml-1 rounded bg-cta px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-cta-foreground">
          {label}
        </span>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const staff = path.startsWith("/owner") || path.startsWith("/tech");
  return staff ? <StaffHeader path={path} /> : <PublicHeader />;
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-5">
        <Logo />
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            to="/owner"
            className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            Staff
          </Link>
          <Button asChild variant="cta" size="sm" className="h-10 px-3 sm:px-4">
            <Link to="/book">Request a visit</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function StaffHeader({ path }: { path: string }) {
  const fn = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fn(), retry: false, staleTime: 60_000 });
  const isOwner = !!me.data?.isOwner;
  const role = isOwner ? "Owner" : me.data?.isTech ? "Technician" : "";
  const tab = "inline-flex min-h-10 items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground hover:text-foreground";
  const active = { className: "border-cta text-foreground font-medium" };
  return (
    <header className="sticky top-0 z-40 border-b-2 border-cta bg-card shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-5">
        <Logo to={isOwner ? "/owner" : "/tech"} label={isOwner ? "Dispatch console" : "Field app"} />
        <div className="flex shrink-0 items-center gap-2">
          {me.data?.name && (
            <span className="hidden items-center gap-2 rounded-full border bg-surface px-2.5 py-1 text-sm sm:inline-flex">
              <span className="grid size-6 place-items-center rounded-full bg-primary font-mono text-[10px] text-primary-foreground">
                {me.data.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
              </span>
              <span className="font-medium">{me.data.name.split(" ")[0]}</span>
              <span className="text-muted-foreground">· {role}</span>
            </span>
          )}
          <SignOut />
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 sm:px-3" aria-label="Staff sections">
        {isOwner && <Link to="/owner" className={tab} activeProps={active}>Dispatch board</Link>}
        <Link to="/tech" className={tab} activeProps={active}>{isOwner ? "Technician view" : "My jobs"}</Link>
        <Link to="/" className={`${tab} ml-auto`}>Customer site ↗</Link>
        {!path && null}
      </nav>
    </header>
  );
}
