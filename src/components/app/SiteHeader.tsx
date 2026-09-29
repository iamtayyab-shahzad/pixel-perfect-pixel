import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/owner", label: "Owner" },
  { to: "/tech", label: "Technician" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CoolFlow HVAC home">
          <span className="grid size-7 place-items-center rounded-md bg-primary font-mono text-[11px] font-medium text-primary-foreground">
            CF
          </span>
          <span className="font-semibold tracking-tight">CoolFlow HVAC</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {n.label}
            </Link>
          ))}
          <Button asChild variant="cta" size="sm" className="ml-1">
            <Link to="/book">Request a visit</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
