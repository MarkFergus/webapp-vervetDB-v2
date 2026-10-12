# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Vervet Monkey Foundation staff (admins, maintenance, editors/volunteers) are the primary users. They work on phones around the sanctuary, often outdoors in bright light, recording and looking up care information for individual monkeys and enclosures. A read-only public/visitor audience is secondary: browsing monkeys and playing the face-learning game.

## Product Purpose
vervetDB is the Foundation's monkey database: search, filter and browse every monkey, view photos and details, and keep care records current. Success is staff trusting it as the single place for who each monkey is, where they live and what is happening with them, with changes shared instantly.

## Positioning
A records system first: care and status records (enclosures, Sickbay, integration reports, released status, feeding/AM lists, monitoring) tied to each monkey's identity. Photos, printable profile books, enclosure QR codes and the Monkey Guesser game support that record rather than lead it.

## Operating Context
Mobile-first web app (installable PWA ambitions) on Supabase (database, sign-in, photo storage). Staff accounts are invite-only with roles (admin, maintenance). Printed/PDF outputs (profile books, AM plates, monitoring sheets) and enclosure QR signs are part of daily routines. Data may be entered late, so date entry for arrivals/moves is planned.

## Capabilities and Constraints
- Monkey records, enclosures and enclosure types (troop, block, care unit; introcage, area), statuses (In Sickbay, Released), integration reports, maintenance log, account photos.
- Admin-only actions sit under More Actions; some fields are staff-only.
- Full names on screen (Dino & Daniel, Holt & Barrington); data keeps initials; short forms only on cards/rows.
- All button labels are Title Case.
- No native store app. Planned: FileMaker records sync (2.0), offline recording of monitoring, deworming and meds (3.0).

## Brand Commitments
Name: vervetDB, for the Vervet Monkey Foundation (logos in /logos). Direction the owner has stated: modern, minimal, YouTube/X-like feel.

## Evidence on Hand
Live site https://vervetdb.com/, README.md, real monkey data and photos in Supabase, logos in /logos. No testimonials or usage metrics exist; do not fabricate.

## Product Principles
1. Staff speed in the field beats decoration: few taps, readable in sunlight.
2. The record is the truth: every status and change is clear, attributed and shared immediately.
3. Plain, consistent language for volunteers of varying experience.
4. Small tidy increments over big rewrites.

## Accessibility & Inclusion
Meet WCAG 2.1 AA. Design for outdoor glare, one-handed phone use, and low technical confidence.
