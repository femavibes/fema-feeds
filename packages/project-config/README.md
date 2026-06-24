# @cfb/project-config

Load and save **per-project L1 settings** as JSON files under `config/projects/`.

Each file is named `{projectId}.json` and matches `ProjectL1Config` from `@cfb/core-types`.

The future web UI (or a small REST API) should call `saveProject()` / `loadAllProjects()` rather than touching paths directly — ingest, list refresh, and the API all share this layer.
