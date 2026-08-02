# Context notes

Durable notes about explorations of, and changes to, this repository — what was learned,
what was decided, and why. Newest first.

New notes are written by the `ctx` skill (`.claude/skills/ctx/SKILL.md`); read that before
adding one by hand so the format stays consistent.

| Date | Note | Type | Summary |
|---|---|---|---|
| 2026-08-02 | [Code-first database bootstrap on startup](2026-08-02-code-first-db-bootstrap.md) | change | `PrepDB` rewritten and wired into `Program.Main`: creates the database if missing and applies pending migrations before serving traffic, with a retry loop for containers. Verified cold-start creation and idempotent restart. Flags the anonymous `GET /api/seed` endpoint. |
| 2026-08-02 | [ClientApp modernization: React 16→18, CRA→Vite](2026-08-02-clientapp-dependency-update.md) | both | Material-UI and `sudo` were entirely unused — dropped, so no component rewrite was needed. React 18, axios 1.x, `@microsoft/signalr`, then replaced react-scripts with Vite 6: 1321→124 packages, 28→**0** vulnerabilities, 30s→1.5s builds. Verified through the ASP.NET SPA proxy and as static `dist` output. |
| 2026-08-02 | [.NET Core 3.1 → .NET 10 upgrade + full project analysis](2026-08-02-dotnet-10-upgrade.md) | both | Retargeted all six projects to `net10.0`, replaced discontinued packages, fixed the SqlClient `Encrypt` default and hosting-API breaks. Verified end to end against LocalDB (SQL Server 2025): migration, register/login, threads, messages, search, access control, SignalR negotiate. Catalogues pre-existing bugs left in place. |
