---
name: use-gerdoo
description: Use when the user asks to deploy, manage, or troubleshoot an app/service on Gerdoo (a Vercel/Railway-style cloud platform) via its MCP tools (gerdoo_*) or the `gerdoo` CLI.
---

# Using Gerdoo

Gerdoo is a cloud platform: **projects** (workspaces) contain **environments**
(production/staging/preview) and **services** (git-deployed apps or long-running
containers). If the `gerdoo_*` MCP tools are available, prefer them over
shelling out to the `gerdoo` CLI — they return structured data instead of text
to parse. Everything below routes on user intent.

## Set up a new project/service

1. If the user hasn't named a project, call `gerdoo_list_projects` first — most
   accounts have a "Default" project that's fine to use.
2. To deploy the current working directory's code, use
   `gerdoo_deploy_service_source` with `path: "."`. This packs the directory
   into a tarball and either redeploys the service already linked to it
   (`.gerdoo/service.json`) or creates a new one — you don't need to create a
   service first for source deploys.
3. To run a prebuilt Docker image instead of building from source, use
   `gerdoo_create_service` with `image`.
4. To add another environment (e.g. staging) to a project, use
   `gerdoo_create_environment`.

## Deploy the current directory

Call `gerdoo_deploy_service_source path:"."`. Repeat calls in the same
directory redeploy the same service automatically — never guess a service ref
just to "redeploy"; only pass `service` explicitly if the user names a
*different* service than the one linked to this directory.

## Check status / "is it live?"

Call `gerdoo_get_service` with the slug or id. It returns status, URL, and
live CPU/memory usage. Use `gerdoo_list_services` first if you don't know the
service's slug or id — never fabricate one.

## Something's broken / debugging

Work outward from the freshest signal:
1. `gerdoo_get_logs` — recent container output.
2. `gerdoo_list_builds` then `gerdoo_get_build_logs` — if the problem looks
   like a bad deploy rather than a runtime crash.
3. `gerdoo_list_releases` then `gerdoo_rollback_service` — only if the user
   confirms they want to revert to a specific prior build. Rollback is
   destructive; never call it without the user's explicit go-ahead in the
   conversation.

## Environment variables and secrets

Gerdoo has two separate stores — pick the right one:
- **Plain env map** (`gerdoo_list_env_vars` / `gerdoo_set_env_vars` /
  `gerdoo_remove_env_vars`): simple key/value pairs on the service.
- **Typed variable store** (`gerdoo_list_variables` / `gerdoo_set_variable` /
  `gerdoo_remove_variable`): supports `build_time` (also inject at build) and
  `secret` (masked) flags. Prefer this store when the user mentions "secret",
  "build-time", or asks for masking.

Setting or removing variables recreates the service to apply the change —
mention this to the user before doing it if it wasn't already obvious from
context.

## Custom domains

`gerdoo_add_domain` returns DNS records (type/name/value) the user must add at
their domain registrar — always show these to the user, don't just say
"done." Once they've added the records, call `gerdoo_verify_domain` to check.

## Safety rules

- **Never call a destructive tool without the user's explicit confirmation in
  the conversation first**, even though these tools require `confirm: true` as
  a parameter. That parameter is a safety net, not a substitute for asking.
  Destructive tools: `gerdoo_delete_service`, `gerdoo_delete_project`,
  `gerdoo_remove_env_vars`, `gerdoo_remove_variable`, `gerdoo_remove_domain`,
  `gerdoo_rollback_service`, `gerdoo_suspend_service`.
- **Never fabricate a project/service/environment ref.** Always resolve it via
  a `gerdoo_list_*` or `gerdoo_get_*` tool first if you're not certain of the
  exact slug or id.
- MCP tools run with the same full-account privileges as any other
  authenticated `gerdoo` CLI command — there's no per-project scoping, so be
  extra careful that a ref actually refers to the resource the user means.
