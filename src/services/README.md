# services/

Data access layer. Routes and components must call functions exported here
(or server functions wrapping them) — never a database client directly.

No backend is connected yet. When Lovable Cloud (Postgres) is enabled:
- add `*.server.ts` repositories per entity in `src/domain/types.ts`
- expose them to the UI through `*.functions.ts` server functions in `src/lib/`
- keep row-level security per business and per role (owner / technician)

No mock or seed data lives here on purpose.
