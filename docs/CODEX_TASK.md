Read SPEC.md carefully. Initialize a Next.js 15 project with Convex in this directory. Use TypeScript, Tailwind CSS, and App Router. Create the full Convex schema from the spec. Seed the database with 5 initial agents. Do NOT start the dev server when done.

Agents to seed:
1. Motoko - Squad Lead - session agent:main:main
2. Forge - Developer - session agent:developer:main  
3. Quill - Writer - session agent:writer:main
4. Recon - Researcher - session agent:researcher:main
5. Pulse - Monitor - session agent:monitor:main

Each agent needs model config:
- thinking: appropriate model from spec
- heartbeat: google/gemini-2.5-flash
- fallback: google-antigravity/claude-sonnet-4-5
