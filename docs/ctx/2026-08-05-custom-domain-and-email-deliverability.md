# Custom domain and email deliverability

- **Date:** 2026-08-05
- **Type:** change
- **Scope:** `.do/app.yaml`, `CLAUDE.md`, DNS at the registrar (Namecheap, `vtechsolutions.site`). PR #35, issue #30, commit `8b5438d`.
- **Status:** done

## Context
Activation email (shipped in the #25 email-activation work, see
`2026-08-05-email-activation.md`) had landed in spam on every send since launch. This work
diagnoses and fixes that, and gives the app a real domain to be served on.

## What I found
The root cause was not the template, the provider, or sender warm-up: it was structural.
Mail was sent from a `gmail.com` address relayed through Brevo. **Nothing but Google can
authenticate mail as `gmail.com`** — Gmail's own SPF record does not list Brevo's sending IPs,
and the DKIM signature on a Brevo-relayed message is Brevo's key, not Google's — so both SPF
and DKIM alignment fail, and DMARC fails with them. No code change could have fixed this; it
required a domain the app controls. Generalizes to a rule: **never set a `From` address on a
domain you don't control.**

Brevo's onboarding explicitly asked for **no SPF record**, because DKIM alignment alone
satisfies DMARC. This mattered because the registrar already publishes an email-forwarding
SPF record; a second SPF TXT record would be a permanent conflict that **fails SPF entirely**
(a domain may have only one SPF record) — worse than adding nothing. Verified via `nslookup`
against the live domain that exactly one SPF TXT record exists at the apex:
`v=spf1 include:spf.efwd.registrar-servers.com ~all`.

The Brevo ownership record is **not** at a `brevo-code` subdomain as its name suggests — it is
a second TXT record at the **apex** (`vtechsolutions.site`), alongside the SPF record:
`brevo-code:ea5409729abdc0edd2c7b1678bc2855a`. Confirmed live via `nslookup -type=TXT
vtechsolutions.site`.

`.do/app.yaml`'s `domains:` entry carries **no `zone:` key** (`.do/app.yaml:15-21`). With one,
DigitalOcean expects to manage the DNS zone itself (i.e. wants to be the domain's
nameservers). Without it, App Platform instead waits for an externally-managed CNAME
(`chat` → the app's `*.ondigitalocean.app` hostname) and issues a Let's Encrypt certificate
once that CNAME resolves and verifies. That is the correct shape for DNS staying at the
registrar rather than moving to DigitalOcean nameservers — which was a deliberate choice
(next section).

Two settings are load-bearing and fail **silently**, both now documented in `CLAUDE.md`:
- `Cors__AllowedOrigins__1` (`.do/app.yaml:79-85`) must list `https://chat.vtechsolutions.site`.
  The CORS policy uses `AllowCredentials()`, which forbids a wildcard origin — an origin left
  off the list means SignalR simply refuses to connect, with no CORS error surfaced; it
  presents as "chat is broken." The prior `ondigitalocean.app` origin (`Cors__AllowedOrigins__0`)
  was deliberately kept, not replaced — removing it while testing the new domain is an easy
  way to lock yourself out of a URL that still works.
- `App__PublicUrl` (`.do/app.yaml:135-139`) was set to the literal
  `https://chat.vtechsolutions.site` rather than left as `${APP_URL}`. If `${APP_URL}` does
  not resolve to the PRIMARY domain, every activation and password-reset link keeps pointing
  at the old `ondigitalocean.app` hostname — which still works, but quietly defeats the point
  of having a domain at all.

## What changed
- Bought `vtechsolutions.site` at Namecheap; app served at `https://chat.vtechsolutions.site`.
- **DNS stays at the registrar**, not moved to DigitalOcean nameservers — no nameserver cutover,
  no propagation risk, and nothing is gained by moving it since App Platform only needs one
  CNAME.
- Eight DNS records added, all verified live against the authoritative resolver (see
  Verified): `chat` CNAME → `webchat-edbgd.ondigitalocean.app`; a `brevo-code` ownership TXT
  (actually placed at the apex, see above); `brevo1._domainkey` and `brevo2._domainkey`
  CNAMEs pointing at `b1.vtechsolutions-site.dkim.brevo.com` /
  `b2.vtechsolutions-site.dkim.brevo.com` (CNAME-based DKIM, so Brevo can rotate its signing
  key without further DNS changes); `_dmarc` TXT (`v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`);
  and `em`, `r.em`, `img.em` CNAMEs for Brevo's branded tracking-link domain.
- `.do/app.yaml`: added the `domains:` block (no `zone:`), `Cors__AllowedOrigins__1`,
  `Email__FromAddress` changed from `REPLACE_ME` to `noreply@vtechsolutions.site`, and
  `App__PublicUrl` changed from `${APP_URL}` to the literal domain.
- `CLAUDE.md`: two new bullets recording the domain, the CORS/PublicUrl footguns, and the
  "never send from a domain you don't control" rule.

## Decisions and trade-offs
- **`p=none` for DMARC, deliberately**, not `p=quarantine` or `p=reject`. `p=none` monitors
  alignment without acting on failures; starting at `quarantine` would silently discard the
  app's own mail if anything were misconfigured, with no signal that it happened. A future
  tightening to `quarantine`/`reject` is implied but not scheduled here.
- **DNS kept at the registrar rather than delegated to DigitalOcean.** Rejected the
  alternative of moving to DO nameservers (which the `zone:` key would trigger) because App
  Platform's only requirement is a single CNAME plus a few Brevo-owned records — delegating
  the whole zone for that would add a cutover with nothing to show for it.
- **Branded link prefix chosen as `em`, not `mail`.** Nothing occupies `mail.vtechsolutions.site`
  today, but it's the obvious name to reach for if a real mailbox is ever added to the domain;
  having Brevo already own it would be an avoidable collision later.

## Verified
- `nslookup` against the live domain (2026-08-05) for all eight records: `chat` CNAME,
  apex TXT (both SPF and `brevo-code`), `brevo1._domainkey` / `brevo2._domainkey` CNAMEs,
  `_dmarc` TXT, `em` / `r.em` / `img.em` CNAMEs — all resolve as described above, and exactly
  one SPF record exists at the apex.
- `curl -I http://chat.vtechsolutions.site` → `301` to `https://chat.vtechsolutions.site/`.
- `curl -I https://chat.vtechsolutions.site/health` → `200`.
- TLS certificate: `notBefore=Aug 5 15:40:02 2026 GMT`, `notAfter=Nov 3 16:40:01 2026 GMT`
  (checked via `openssl s_client` against the live endpoint).
- SignalR connecting from the new origin was reported as confirmed by the repo owner; not
  independently re-verified by this note.
- A real registration to a Gmail address was reported to arrive in the inbox (not spam) with
  SPF, DKIM and DMARC all passing, per the commit message and issue description; not
  independently re-verified by this note (would require sending a live email, out of scope
  for corroboration).

## Known issues / follow-ups
- DMARC is at `p=none`, i.e. monitor-only. Moving to `p=quarantine` (and eventually `p=reject`)
  once alignment is confirmed stable over time is implied but not tracked as a ticket here.
- The certificate expires 2026-11-03; App Platform is expected to auto-renew, but this has not
  been observed happening yet since the domain is new.
