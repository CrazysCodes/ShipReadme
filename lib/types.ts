export type SignalName =
  | "README"
  | "package.json"
  | "pyproject.toml"
  | "requirements.txt"
  | "Cargo.toml"
  | "go.mod"
  | "Dockerfile"
  | "docker-compose.yml"
  | ".env.example"
  | "LICENSE"
  | "Tests"
  | "CI"
  | "Screenshots";

export type HealthCategory =
  | "Quick Start"
  | "Configuration"
  | "Testing"
  | "Deployment"
  | "License"
  | "Contributing"
  | "Screenshots / Demo";

export type IssueSeverity = "high" | "medium" | "low";

export interface RepoRef {
  owner: string;
  repo: string;
  url: string;
}

export interface RepoFile {
  path: string;
  size?: number;
  sha?: string;
}

export interface ManifestFacts {
  packageManager?: string;
  packageScripts: Record<string, string>;
  pythonManagers: string[];
  cargo?: boolean;
  go?: boolean;
}

export interface RepoFacts {
  ref: RepoRef;
  name: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  files: RepoFile[];
  signals: Record<SignalName, RepoFile[]>;
  readme: string | null;
  fetchedText: Record<string, string>;
  manifest: ManifestFacts;
}

export interface Evidence {
  file: string;
  note: string;
  matched?: string;
}

export interface HealthIssue {
  category: HealthCategory;
  title: string;
  detail: string;
  severity: IssueSeverity;
  evidence: Evidence[];
}

export interface CategoryReport {
  category: HealthCategory;
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  evidence: Evidence[];
}

export interface AnalyzeResult {
  repository: {
    owner: string;
    repo: string;
    url: string;
    defaultBranch: string;
    description: string | null;
    stars: number;
  };
  score: number;
  missingItems: string[];
  issues: HealthIssue[];
  categories: CategoryReport[];
  signals: Record<SignalName, RepoFile[]>;
  generatedReadme: string;
}
