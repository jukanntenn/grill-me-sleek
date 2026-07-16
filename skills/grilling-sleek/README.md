# grilling-sleek skill assets

This directory contains the **grilling-sleek skill** for AI agents.

## CLI Installation

The CLI is now distributed via npm. Install it globally:

```bash
npm install -g @grilling-sleek/cli
```

Or use it directly with npx:

```bash
npx @grilling-sleek/cli --help
```

## Files

| File | Description |
| --- | --- |
| `SKILL.md` | Skill instructions for AI agents |
| `schemas/grilling.json` | Authoritative Grilling schema (what the CLI validates against) |
| `schemas/response.json` | Response shape, for reference when parsing poll output |

## Usage

The SKILL.md file contains instructions for AI agents on how to use the grilling-sleek CLI. The CLI communicates with the Hub to create and manage grilling sessions.

For self-hosting, configure the CLI to use your server:

```bash
grilling-sleek config set server http://your-server:3000
```

## Schema Files

The schema files in `schemas/` are reference copies. The authoritative versions are in `server/schemas/`. Do not hand-edit the schema files here.
