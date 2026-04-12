<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/_media/crumbs-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/_media/crumbs-logo-light.png">
    <img alt="lattice" src="docs/_media/crumbs-logo-light.png" style="max-width: 100%; border-radius: 8px;">
  </picture>
</p>

<p align="center">
  Tiny Pi helpers and playful extension experiments, bundled in one cozy crumb pile.
</p>

## Prerequisites

Install these tools first:

- [Pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) installed on your system so the `pi` command is available

```bash
bun install -g @mariozechner/pi-coding-agent
// OR
npm install -g @mariozechner/pi-coding-agent
```

- [mise](https://mise.jdx.dev/) installed on your system

## First-time setup

Run these commands once when setting up the project for the first time:

```bash
mise trust
mise install
bun install
```

- `mise trust` lets mise use this project's config
- `mise install` installs the pinned project tools
- `bun install` installs the package dependencies

## Install extensions

```bash
pi install .
```

Use `-l` to install into project settings (`.pi/settings.json`) instead of global settings.

```bash
pi install -l .
```

## Remove extensions

```bash
pi remove .
```

```bash
pi remove -l .
```
