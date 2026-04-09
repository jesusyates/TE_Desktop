# AICS Desktop (Execution Client)

## Overview
- Desktop frontend for AICS content-creation workflow.
- Architecture follows `Shared Core + Product Domain + Country Layer`.
- Client role: UI + workflow orchestration, no local AI engine.

## Structure
- `main/` Electron main process
- `preload/` secure IPC bridge
- `renderer/` React + TypeScript frontend
- `database/` AICS domain schema draft

## Security Baseline
- `contextIsolation: true`
- `sandbox: true`
- renderer has no direct system API access
- token operations exposed via minimal IPC methods only

## Run (after Node.js installation)
1. `npm install`
2. `npm run dev`
