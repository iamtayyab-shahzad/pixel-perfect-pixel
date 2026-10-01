import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-5">
        <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="CoolFlow HVAC home">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-mono text-[11px] font-medium text-primary-foreground">
            CF
          </span>
          <span className="truncate whitespace-nowrap font-semibold tracking-tight">
            CoolFlow<span className="hidden sm:inline"> HVAC</span>
          </span>
        </Link>
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
