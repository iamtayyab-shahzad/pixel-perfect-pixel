<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# CoolFlow HVAC — architecture rules
- `src/domain/types.ts` is the single source of entity types; mirrors future Postgres tables 1:1.
- `src/lib/scheduling/` holds Smart Slot Match as pure functions returning per-constraint results — keeps rules transparent and testable.
- `src/services/` is the only data-access layer; UI never calls a DB client directly — backend swaps stay isolated.
- `src/components/app/` holds product primitives (PageHeader, StatusBadge, EmptyState); `components/ui/` stays shadcn.
- Colors only via semantic tokens in `src/styles.css`; status colors only via `<StatusBadge tone>`.
- Confirmed appointments change only via a JobEvent with before/after + reason — never silent edits.
- No mock data presented as real; unbuilt features show honest empty states.
