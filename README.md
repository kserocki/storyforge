# Storyforge

**Consistent multi-shot video ads from a one-line brief — with surgical chat edits.**

> 🚧 **Work in progress.** Built in public. Demo gallery, video and architecture diagram will land here as milestones ship.

<!-- HERO GIF: chat edit regenerating a single shot while the rest of the storyboard stays intact -->
<!-- DEMO: link to the no-login gallery -->

## What it does

Type a brief like *"20-second ad for new headphones, neon city at night, cyberpunk mood"* and Storyforge:

1. **Breaks it into shots** with an LLM (structured output: description, camera move, duration).
2. **Locks consistency** — one reference frame and a shared style/product lock carried across every shot, so separately generated clips still look like one ad.
3. **Lays the shots out as a node graph** — Brief → Shots → Keyframe → Clip → Final cut — with live progress on each node.
4. **Generates a keyframe per shot**, then turns each keyframe into a short clip via the [Runway API](https://docs.dev.runwayml.com/).
5. **Stitches** the clips into one video.
6. **Edits surgically by chat** — *"make shot 3 a close-up, warmer light"* changes only that node, and **only that shot regenerates**.

## Why it's interesting to build

Video generation APIs are asynchronous, take minutes per clip and are tightly concurrency-limited. Storyforge is an exercise in building a **responsive product on top of slow, rate-limited async work**:

- a Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`) and a per-shot state machine with retries and backoff,
- concurrency control matched to the provider's limits, spend caps on every generation,
- live progress streamed to the UI (SSE over Postgres `LISTEN/NOTIFY`),
- partial regeneration, so an edit costs one shot instead of the whole video.

## Stack

| Area | Tech |
|---|---|
| Web | React, Vite, TypeScript, React Flow, TanStack Query |
| API & worker | Node.js, TypeScript, Fastify, zod |
| Data | PostgreSQL, Drizzle |
| AI | Runway API (image & image-to-video), Gemini via Vercel AI SDK |
| Media | ffmpeg |
| Infra | AWS (ECS Fargate, RDS, S3, CloudFront), Terraform, GitHub Actions (OIDC) |

## Roadmap

- [ ] Local vertical slice: brief → shot list → job queue → first clip
- [ ] Node-graph canvas with live progress
- [ ] Consistency lock (reference frame + style)
- [ ] Chat edits with partial regeneration
- [ ] Final cut (ffmpeg stitch)
- [ ] LLM evals for shot breakdown and edits
- [ ] AWS deployment (Terraform) + public gallery
- [ ] Later: SQS + transactional outbox, idempotency keys, credit ledger, signed webhooks

## Running locally

_Coming with the first milestone._

## About

Built by [Krzysztof Serocki](https://github.com/kserocki) — 7+ years shipping consumer mobile apps (Android/Kotlin), now building full-stack TypeScript products. Not affiliated with Runway.

## License

[MIT](LICENSE)
