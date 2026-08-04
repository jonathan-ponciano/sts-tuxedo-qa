import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.ts";

export interface ProvisionRequest {
  provider: "local" | "github";
  localPath?: string;
  remoteUrl?: string;
  pat?: string;
  branch: string;
  buildMethod: "dockerfile" | "node";
  port: number;
}

export interface ProvisionResult {
  sandboxId: string;
  internalBaseUrl: string;
}

interface Sandbox {
  containerName: string;
  networkName: string;
  imageName: string | null;
  internalBaseUrl: string;
}

const sandboxes = new Map<string, Sandbox>();

async function run(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

async function runOrThrow(cmd: string[], label: string): Promise<string> {
  const { code, stdout, stderr } = await run(cmd);
  if (code !== 0) throw new Error(`${label} failed (exit ${code}): ${(stderr || stdout).slice(0, 2000)}`);
  return stdout.trim();
}

function detectBunScript(pkgJsonText: string): "start" | "dev" {
  const pkg = JSON.parse(pkgJsonText) as { scripts?: Record<string, string> };
  if (pkg.scripts?.start) return "start";
  if (pkg.scripts?.dev) return "dev";
  throw new Error("package.json has neither a 'start' nor a 'dev' script");
}

/**
 * Every `docker` call here talks to the HOST's daemon over the socket
 * mounted into this container at start (see the runner's run command in the
 * deploy docs) — "sibling containers", not real Docker-in-Docker. That's why
 * bind-mount sources below must be HOST-side paths: a `local` repo's path
 * IS one already (the user typed a path on their own machine, where this
 * whole stack runs); a `github` repo is cloned under this container's own
 * `DATA_DIR`, which is itself a bind mount, so `config.hostDataDir` gives
 * the equivalent host path for the *docker run* issued against the host.
 */
export async function provisionSandbox(req: ProvisionRequest): Promise<ProvisionResult> {
  const id = randomUUID().slice(0, 8);
  const containerName = `tuxedo-sandbox-${id}`;
  const networkName = `tuxedo-sandbox-net-${id}`;

  let hostRepoPath: string;
  let runnerRepoPath: string | null = null; // only set when this container can itself read the files (the 'github' clone case)
  if (req.provider === "local") {
    if (!req.localPath) throw new Error("localPath is required for provider 'local'");
    hostRepoPath = req.localPath;
  } else {
    if (!req.remoteUrl) throw new Error("remoteUrl is required for provider 'github'");
    if (!config.hostDataDir) throw new Error("HOST_DATA_DIR is not configured on this runner — required to clone a remote repo");
    runnerRepoPath = join(config.dataDir, "sandboxes", id, "repo");
    mkdirSync(join(config.dataDir, "sandboxes", id), { recursive: true });
    const cloneUrl = req.pat ? req.remoteUrl.replace("https://", `https://${req.pat}@`) : req.remoteUrl;
    try {
      await runOrThrow(["git", "clone", "--branch", req.branch, "--single-branch", "--depth", "1", cloneUrl, runnerRepoPath], "git clone");
    } catch (err) {
      // Never let a PAT leak into an error message a dashboard user might see.
      throw new Error((err as Error).message.replaceAll(req.pat ?? "\0", "***"));
    }
    hostRepoPath = join(config.hostDataDir, "sandboxes", id, "repo");
  }

  await runOrThrow(["docker", "network", "create", networkName], "docker network create");
  await runOrThrow(["docker", "network", "connect", networkName, config.runnerContainerName], "docker network connect (runner)");

  let imageName: string | null = null;
  try {
    if (req.buildMethod === "dockerfile") {
      imageName = containerName;
      await runOrThrow(["docker", "build", "-t", imageName, hostRepoPath], "docker build");
      await runOrThrow(
        ["docker", "run", "-d", "--name", containerName, "--network", networkName, "--network-alias", "sandbox", imageName],
        "docker run",
      );
    } else {
      // Node/Bun fallback: bind-mount the repo, install, run the detected
      // script — no image build. For 'local' repos we can't read the host
      // path from inside this container to detect which script exists, so
      // we just try "start" and let it fail loudly if that's wrong.
      let script: "start" | "dev" = "start";
      if (runnerRepoPath) {
        const pkgJsonPath = join(runnerRepoPath, "package.json");
        if (!existsSync(pkgJsonPath)) throw new Error(`no package.json found at ${pkgJsonPath} after clone`);
        script = detectBunScript(await Bun.file(pkgJsonPath).text());
      }
      await runOrThrow(
        [
          "docker",
          "run",
          "-d",
          "--name",
          containerName,
          "--network",
          networkName,
          "--network-alias",
          "sandbox",
          "-v",
          `${hostRepoPath}:/app`,
          "-w",
          "/app",
          "oven/bun:1-slim",
          "sh",
          "-c",
          `bun install && bun run ${script}`,
        ],
        "docker run",
      );
    }
  } catch (err) {
    await run(["docker", "network", "disconnect", networkName, config.runnerContainerName]);
    await run(["docker", "network", "rm", networkName]);
    throw err;
  }

  const internalBaseUrl = `http://${containerName}:${req.port}`;
  sandboxes.set(id, { containerName, networkName, imageName, internalBaseUrl });
  return { sandboxId: id, internalBaseUrl };
}

export async function checkSandboxHealth(id: string, path = "/"): Promise<boolean> {
  const sandbox = sandboxes.get(id);
  if (!sandbox) return false;
  try {
    const res = await fetch(`${sandbox.internalBaseUrl}${path}`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function teardownSandbox(id: string): Promise<void> {
  const sandbox = sandboxes.get(id);
  if (!sandbox) return; // already gone — teardown is idempotent, callers (including the reaper) don't need to check first
  await run(["docker", "rm", "-f", sandbox.containerName]);
  await run(["docker", "network", "disconnect", sandbox.networkName, config.runnerContainerName]);
  await run(["docker", "network", "rm", sandbox.networkName]);
  if (sandbox.imageName) await run(["docker", "image", "rm", sandbox.imageName]);
  sandboxes.delete(id);
}
