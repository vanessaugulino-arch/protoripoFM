# Fashion Mind - PlanoV7

## Overview
A SaaS Business Intelligence platform for the fashion industry. It implements a sequential collection planning workflow with Role-Based Access Control (RBAC) across three user roles:
- **CEO (Strategic):** Defines revenue goals, budget, and target margins.
- **Creative Direction (Tactical):** Breaks down goals by group (Women, Men, Kids) and defines themes/colors.
- **Style (Operational):** Defines detailed product mix and operational plans.

## Tech Stack
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite 6
- **Package Manager:** pnpm
- **Styling:** Tailwind CSS 4.0 (via `@tailwindcss/vite` plugin)
- **UI Components:** Shadcn/UI (Radix UI primitives) + MUI
- **Routing:** React Router 7
- **State Management:** React Context (WorkflowContext)

## Project Structure
- `src/app/pages/` — Route-level page components
- `src/app/components/` — Reusable UI and feature components
- `src/app/contexts/` — React Context providers (WorkflowContext)
- `src/app/utils/` — Permissions logic and helpers
- `src/app/hooks/` — Custom React hooks
- `src/app/types/` — TypeScript interfaces/types
- `src/styles/` — Global CSS and theme variables
- `src/assets/` & `src/imports/` — Static assets and images

## Key Features
- Multi-tenant SaaS architecture (designed for future Supabase backend)
- Workflow state machine: `draft` → `pending_creative` → `pending_style` → `completed`
- Real-time margin/discount calculations on CycleClosing page
- Role-based section visibility and editability

## Development
- **Start:** `pnpm run dev` (runs on port 5000)
- **Build:** `pnpm run build`
- Vite config uses `host: '0.0.0.0'`, `port: 5000`, `allowedHosts: true` for Replit proxy compatibility

## Deployment
- Configured as a static site deployment
- Build command: `pnpm run build`
- Public directory: `dist`
