import type { RepoFacts, RepoFile, RepoRef } from "./types";

const GITHUB_API = "https://api.github.com";
const MAX_TREE_ITEMS = Number(process.env.MAX_REPOSITORY_TREE_ITEMS ?? 3000);
const MAX_FILE_BYTES = Number(process.env.MAX_FETCH_FILE_BYTES ?? 120000);

interface GithubRepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  html_url: string;
}

interface GithubTreeResponse {
  truncated: boolean;
  tree: Array<{
    path: string;
    type: "blob" | "tree" | string;
    size?: number;
    sha?: string;
  }>;
}

export class GithubAnalyzeError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

/** 解析用户输入的 GitHub 仓库地址，拒绝非 GitHub 或缺少 owner/repo 的 URL。 */
export function parseGithubUrl(input: string): RepoRef {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new GithubAnalyzeError("请输入有效的 GitHub 仓库 URL。", 400);
  }

  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    throw new GithubAnalyzeError("目前只支持 github.com 上的公开仓库。", 400);
  }

  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, "");

  if (!owner || !repo) {
    throw new GithubAnalyzeError("仓库 URL 需要包含 owner 和 repo，例如 https://github.com/vercel/next.js。", 400);
  }

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`
  };
}

function githubHeaders(raw = false): HeadersInit {
  const headers: HeadersInit = {
    Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ShipReadme-MVP"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function githubJson<T>(path: string): Promise<T> {
  const startedAt = Date.now();
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: githubHeaders(),
    // GitHub 递归 tree 响应可能超过 Next 数据缓存限制，诊断请求直接走实时读取。
    cache: "no-store"
  });

  console.log(`GitHub 接口调用: path=${path}, status=${response.status}, costMs=${Date.now() - startedAt}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new GithubAnalyzeError("没有找到该公开仓库，或仓库不可访问。", 404);
    }
    if (response.status === 403) {
      throw new GithubAnalyzeError("GitHub API 速率受限或拒绝访问。可在 .env 中配置 GITHUB_TOKEN 后重试。", 429);
    }
    throw new GithubAnalyzeError(`GitHub API 请求失败，状态码 ${response.status}。`, 502);
  }

  return response.json() as Promise<T>;
}

async function githubRaw(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(true),
    cache: "no-store"
  });

  console.log(`GitHub 文件读取: repo=${owner}/${repo}, path=${path}, status=${response.status}`);

  if (!response.ok) {
    return null;
  }

  return response.text();
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

function isRoot(path: string) {
  return !path.includes("/");
}

function findRoot(files: RepoFile[], matcher: (path: string) => boolean) {
  return files.filter((file) => isRoot(file.path) && matcher(file.path));
}

function findSignalFiles(files: RepoFile[]) {
  const lower = (value: string) => value.toLowerCase();

  return {
    README: findRoot(files, (path) => /^readme(\.(md|markdown|txt))?$/i.test(path)),
    "package.json": findRoot(files, (path) => lower(path) === "package.json"),
    "pyproject.toml": findRoot(files, (path) => lower(path) === "pyproject.toml"),
    "requirements.txt": findRoot(files, (path) => lower(path) === "requirements.txt"),
    "Cargo.toml": findRoot(files, (path) => lower(path) === "cargo.toml"),
    "go.mod": findRoot(files, (path) => lower(path) === "go.mod"),
    Dockerfile: findRoot(files, (path) => lower(path) === "dockerfile"),
    "docker-compose.yml": findRoot(files, (path) => /^docker-compose\.(ya?ml)$/i.test(path) || /^compose\.(ya?ml)$/i.test(path)),
    ".env.example": findRoot(files, (path) => /^\.env(\.example|\.sample|\.template)$/i.test(path)),
    LICENSE: findRoot(files, (path) => /^licen[cs]e(\.(md|txt))?$/i.test(path)),
    Tests: files.filter((file) => /(^|\/)(test|tests|__tests__)(\/|$)/i.test(file.path)),
    CI: files.filter((file) => /^\.github\/workflows\/.+\.ya?ml$/i.test(file.path)),
    Screenshots: files.filter((file) => /^public\/(assets|images)\//i.test(file.path) && /\.(png|jpe?g|gif|webp|svg)$/i.test(file.path))
  };
}

function detectPackageManager(files: RepoFile[]) {
  if (files.some((file) => file.path === "pnpm-lock.yaml")) return "pnpm";
  if (files.some((file) => file.path === "yarn.lock")) return "yarn";
  if (files.some((file) => file.path === "package-lock.json")) return "npm";
  return "npm";
}

function extractPackageScripts(packageJson: string | null): Record<string, string> {
  if (!packageJson) return {};

  try {
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, unknown> };
    return Object.fromEntries(
      Object.entries(parsed.scripts ?? {}).filter(([, value]) => typeof value === "string")
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function detectPythonManagers(signals: ReturnType<typeof findSignalFiles>) {
  return [
    signals["pyproject.toml"].length > 0 ? "pyproject.toml" : null,
    signals["requirements.txt"].length > 0 ? "requirements.txt" : null
  ].filter(Boolean) as string[];
}

/** 从 GitHub REST API 收集 README 诊断所需事实，只读取关键小文件以保护响应时间。 */
export async function collectRepoFacts(ref: RepoRef): Promise<RepoFacts> {
  const repo = await githubJson<GithubRepoResponse>(`/repos/${ref.owner}/${ref.repo}`);
  const tree = await githubJson<GithubTreeResponse>(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`
  );

  if (tree.truncated || tree.tree.length > MAX_TREE_ITEMS) {
    throw new GithubAnalyzeError(
      `仓库文件树过大，当前限制为 ${MAX_TREE_ITEMS} 个条目。请先选择更小的仓库或提高 MAX_REPOSITORY_TREE_ITEMS。`,
      413
    );
  }

  const files = tree.tree
    .filter((item) => item.type === "blob")
    .map((item) => ({ path: item.path, size: item.size, sha: item.sha }));

  const signals = findSignalFiles(files);
  const fetchTargets = [
    signals.README[0],
    signals["package.json"][0],
    signals["pyproject.toml"][0],
    signals["requirements.txt"][0],
    signals["Cargo.toml"][0],
    signals["go.mod"][0],
    signals.Dockerfile[0],
    signals["docker-compose.yml"][0],
    signals[".env.example"][0],
    signals.LICENSE[0],
    signals.CI[0]
  ].filter((file): file is RepoFile => Boolean(file && (file.size ?? 0) <= MAX_FILE_BYTES));

  const fetchedEntries = await Promise.all(
    fetchTargets.map(async (file) => [file.path, await githubRaw(ref.owner, ref.repo, repo.default_branch, file.path)] as const)
  );
  const fetchedText = Object.fromEntries(fetchedEntries.filter((entry): entry is readonly [string, string] => entry[1] !== null));
  const readmePath = signals.README[0]?.path;
  const packagePath = signals["package.json"][0]?.path;

  return {
    ref,
    name: repo.name,
    description: repo.description,
    defaultBranch: repo.default_branch,
    stars: repo.stargazers_count,
    files,
    signals,
    readme: readmePath ? fetchedText[readmePath] ?? null : null,
    fetchedText,
    manifest: {
      packageManager: packagePath ? detectPackageManager(files) : undefined,
      packageScripts: extractPackageScripts(packagePath ? fetchedText[packagePath] ?? null : null),
      pythonManagers: detectPythonManagers(signals),
      cargo: signals["Cargo.toml"].length > 0,
      go: signals["go.mod"].length > 0
    }
  };
}

export function summarizeFileList(files: RepoFile[], limit = 3) {
  const shown = files.slice(0, limit).map((file) => file.path);
  const more = files.length > limit ? ` 等 ${files.length} 个` : "";
  return `${shown.join(", ")}${more}`;
}

export function basename(path: string) {
  return fileName(path);
}
