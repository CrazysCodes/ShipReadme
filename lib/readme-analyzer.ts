import { basename, summarizeFileList } from "./github";
import type {
  AnalyzeResult,
  CategoryReport,
  Evidence,
  HealthCategory,
  HealthIssue,
  IssueSeverity,
  RepoFacts
} from "./types";

const CATEGORY_WEIGHTS: Record<HealthCategory, number> = {
  "Quick Start": 24,
  Configuration: 14,
  Testing: 16,
  Deployment: 14,
  License: 10,
  Contributing: 10,
  "Screenshots / Demo": 12
};

const CATEGORY_ORDER = Object.keys(CATEGORY_WEIGHTS) as HealthCategory[];

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function evidence(file: string, note: string, matched?: string): Evidence {
  return { file, note, matched };
}

function hasReadmeSection(readme: string, category: HealthCategory) {
  const checks: Record<HealthCategory, RegExp[]> = {
    "Quick Start": [/quick start/i, /getting started/i, /installation/i, /install/i, /usage/i, /快速开始/, /安装/, /运行/, /使用/],
    Configuration: [/configuration/i, /config/i, /\.env/i, /environment/i, /环境变量/, /配置/],
    Testing: [/test/i, /pytest/i, /vitest/i, /jest/i, /测试/],
    Deployment: [/deploy/i, /docker/i, /compose/i, /部署/, /容器/],
    License: [/license/i, /许可证/, /开源协议/],
    Contributing: [/contribut/i, /development/i, /开发/, /贡献/],
    "Screenshots / Demo": [/screenshot/i, /demo/i, /preview/i, /!\[[^\]]*]/i, /截图/, /演示/]
  };

  return includesAny(readme, checks[category]);
}

function addIssue(issues: HealthIssue[], issue: HealthIssue) {
  issues.push(issue);
}

function severityCost(severity: IssueSeverity) {
  return severity === "high" ? 18 : severity === "medium" ? 10 : 5;
}

function commandForScript(packageManager: string, script: string) {
  if (packageManager === "yarn") return script === "start" ? "yarn start" : `yarn ${script}`;
  if (packageManager === "pnpm") return script === "start" ? "pnpm start" : `pnpm ${script}`;
  return script === "start" ? "npm start" : `npm run ${script}`;
}

function installCommand(packageManager?: string) {
  if (packageManager === "yarn") return "yarn install";
  if (packageManager === "pnpm") return "pnpm install";
  return "npm install";
}

function preferredRunScript(scripts: Record<string, string>) {
  return ["dev", "start", "serve"].find((script) => scripts[script]);
}

function preferredTestScript(scripts: Record<string, string>) {
  return ["test", "test:unit", "check"].find((script) => scripts[script]);
}

function categoryEvidence(facts: RepoFacts, category: HealthCategory): Evidence[] {
  const signals = facts.signals;
  switch (category) {
    case "Quick Start":
      return [
        ...signals["package.json"].map((file) => evidence(file.path, "检测到 Node.js 项目脚本来源。")),
        ...signals["pyproject.toml"].map((file) => evidence(file.path, "检测到 Python 项目配置。")),
        ...signals["requirements.txt"].map((file) => evidence(file.path, "检测到 Python 依赖清单。")),
        ...signals["Cargo.toml"].map((file) => evidence(file.path, "检测到 Rust 项目配置。")),
        ...signals["go.mod"].map((file) => evidence(file.path, "检测到 Go 模块配置。"))
      ];
    case "Configuration":
      return signals[".env.example"].map((file) => evidence(file.path, "检测到环境变量样例文件。"));
    case "Testing":
      return [
        ...signals.Tests.slice(0, 3).map((file) => evidence(file.path, "检测到测试目录或测试文件。")),
        ...signals.CI.slice(0, 3).map((file) => evidence(file.path, "检测到 CI 工作流。"))
      ];
    case "Deployment":
      return [
        ...signals.Dockerfile.map((file) => evidence(file.path, "检测到 Dockerfile。")),
        ...signals["docker-compose.yml"].map((file) => evidence(file.path, "检测到 Compose 配置。"))
      ];
    case "License":
      return signals.LICENSE.map((file) => evidence(file.path, "检测到许可证文件。"));
    case "Contributing":
      return facts.files
        .filter((file) => /^contributing(\.md)?$/i.test(basename(file.path)))
        .map((file) => evidence(file.path, "检测到贡献指南文件。"));
    case "Screenshots / Demo":
      return signals.Screenshots.slice(0, 5).map((file) => evidence(file.path, "检测到可用于 README 的图片素材。"));
  }
}

function buildIssues(facts: RepoFacts): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const readme = facts.readme ?? "";
  const signals = facts.signals;
  const scripts = facts.manifest.packageScripts;
  const runScript = preferredRunScript(scripts);
  const testScript = preferredTestScript(scripts);

  if (!facts.readme) {
    addIssue(issues, {
      category: "Quick Start",
      title: "缺少 README.md",
      detail: "仓库根目录没有可读取的 README，用户无法在 GitHub 首屏判断项目用途和启动方式。",
      severity: "high",
      evidence: [evidence("/", "根目录未检测到 README.md / README.markdown / README.txt。")]
    });
  }

  if (Object.keys(scripts).length > 0 && runScript && !readme.includes(commandForScript(facts.manifest.packageManager ?? "npm", runScript))) {
    addIssue(issues, {
      category: "Quick Start",
      title: "启动命令没有进入 README",
      detail: "检测到项目脚本，但 README 没有明确给出真实启动命令。",
      severity: "high",
      evidence: [
        evidence("package.json", `检测到 scripts.${runScript}。`, `"${runScript}": "${scripts[runScript]}"`),
        evidence("README", `未找到 ${commandForScript(facts.manifest.packageManager ?? "npm", runScript)}。`)
      ]
    });
  } else if (!hasReadmeSection(readme, "Quick Start")) {
    addIssue(issues, {
      category: "Quick Start",
      title: "Quick Start 不清晰",
      detail: "README 缺少安装、运行或使用入口。",
      severity: "medium",
      evidence: [evidence("README", "未检测到 Quick Start / Installation / Usage 等章节信号。")]
    });
  }

  if (signals[".env.example"].length > 0 && !hasReadmeSection(readme, "Configuration")) {
    addIssue(issues, {
      category: "Configuration",
      title: "环境变量没有说明",
      detail: "检测到环境变量样例，但 README 没有配置说明。",
      severity: "medium",
      evidence: [
        evidence(signals[".env.example"][0].path, "存在环境变量样例文件。"),
        evidence("README", "未检测到 Configuration / .env / 环境变量章节。")
      ]
    });
  } else if (signals[".env.example"].length === 0) {
    addIssue(issues, {
      category: "Configuration",
      title: "缺少 .env.example",
      detail: "自部署项目通常需要提交脱敏后的环境变量样例，降低首次运行失败率。",
      severity: "low",
      evidence: [evidence("/", "根目录未检测到 .env.example / .env.sample / .env.template。")]
    });
  }

  if ((signals.Tests.length > 0 || testScript || signals.CI.length > 0) && !hasReadmeSection(readme, "Testing")) {
    addIssue(issues, {
      category: "Testing",
      title: "测试入口没有说明",
      detail: "仓库有测试或 CI 信号，但 README 没有告诉贡献者如何运行测试。",
      severity: "medium",
      evidence: [
        ...(testScript ? [evidence("package.json", `检测到 scripts.${testScript}。`, `"${testScript}": "${scripts[testScript]}"`)] : []),
        ...(signals.Tests[0] ? [evidence(signals.Tests[0].path, `检测到测试相关路径：${summarizeFileList(signals.Tests)}。`)] : []),
        ...(signals.CI[0] ? [evidence(signals.CI[0].path, "检测到 CI 工作流。")] : [])
      ]
    });
  } else if (signals.Tests.length === 0 && !testScript && signals.CI.length === 0) {
    addIssue(issues, {
      category: "Testing",
      title: "缺少测试或 CI 信号",
      detail: "没有发现测试目录、测试脚本或 GitHub Actions，README 难以证明项目可验证。",
      severity: "low",
      evidence: [evidence("/", "未检测到 test/tests/__tests__、package test script 或 .github/workflows。")]
    });
  }

  if ((signals.Dockerfile.length > 0 || signals["docker-compose.yml"].length > 0) && !hasReadmeSection(readme, "Deployment")) {
    addIssue(issues, {
      category: "Deployment",
      title: "部署说明与仓库事实不一致",
      detail: "检测到容器化文件，但 README 没有 Docker 或 Compose 部署说明。",
      severity: "medium",
      evidence: [
        ...(signals.Dockerfile[0] ? [evidence(signals.Dockerfile[0].path, "检测到 Dockerfile。")] : []),
        ...(signals["docker-compose.yml"][0] ? [evidence(signals["docker-compose.yml"][0].path, "检测到 Compose 配置。")] : []),
        evidence("README", "未检测到 docker / compose / deployment 说明。")
      ]
    });
  }

  if (signals.LICENSE.length === 0) {
    addIssue(issues, {
      category: "License",
      title: "缺少 LICENSE",
      detail: "开源仓库没有许可证文件，使用者无法明确复用边界。",
      severity: "medium",
      evidence: [evidence("/", "根目录未检测到 LICENSE / LICENCE。")]
    });
  } else if (!hasReadmeSection(readme, "License")) {
    addIssue(issues, {
      category: "License",
      title: "README 没有许可证入口",
      detail: "仓库有 LICENSE，但 README 没有指向许可证。",
      severity: "low",
      evidence: [evidence(signals.LICENSE[0].path, "检测到许可证文件。")]
    });
  }

  const hasContributingFile = facts.files.some((file) => /^contributing(\.md)?$/i.test(basename(file.path)));
  if (!hasContributingFile && !hasReadmeSection(readme, "Contributing")) {
    addIssue(issues, {
      category: "Contributing",
      title: "缺少贡献说明",
      detail: "README 没有贡献入口，也没有单独的 CONTRIBUTING 文件。",
      severity: "low",
      evidence: [evidence("/", "未检测到 CONTRIBUTING.md，README 也缺少贡献说明。")]
    });
  }

  if (signals.Screenshots.length > 0 && !hasReadmeSection(readme, "Screenshots / Demo")) {
    addIssue(issues, {
      category: "Screenshots / Demo",
      title: "已有图片素材但 README 未展示",
      detail: "public/assets 或 public/images 中存在图片，可以用来增强 README 的可信度。",
      severity: "low",
      evidence: [evidence(signals.Screenshots[0].path, `检测到图片素材：${summarizeFileList(signals.Screenshots)}。`)]
    });
  }

  return issues;
}

function buildCategoryReports(facts: RepoFacts, issues: HealthIssue[]): CategoryReport[] {
  return CATEGORY_ORDER.map((category) => {
    const categoryIssues = issues.filter((issue) => issue.category === category);
    const score = Math.max(
      0,
      CATEGORY_WEIGHTS[category] - categoryIssues.reduce((total, issue) => total + severityCost(issue.severity), 0)
    );
    const status = score >= CATEGORY_WEIGHTS[category] * 0.8 ? "pass" : score >= CATEGORY_WEIGHTS[category] * 0.4 ? "warn" : "fail";

    return {
      category,
      score,
      status,
      summary:
        categoryIssues[0]?.title ??
        (categoryEvidence(facts, category).length > 0 ? "README 与仓库信号基本一致。" : "未发现明显风险信号。"),
      evidence: categoryIssues[0]?.evidence ?? categoryEvidence(facts, category)
    };
  });
}

function buildCommands(facts: RepoFacts) {
  const commands: string[] = [];
  const scripts = facts.manifest.packageScripts;
  const packageManager = facts.manifest.packageManager;
  const runScript = preferredRunScript(scripts);

  if (facts.signals["package.json"].length > 0) {
    commands.push(installCommand(packageManager));
    if (runScript) commands.push(commandForScript(packageManager ?? "npm", runScript));
  }
  if (facts.signals["requirements.txt"].length > 0) {
    commands.push("python -m venv .venv", "source .venv/bin/activate", "pip install -r requirements.txt");
  }
  if (facts.signals["pyproject.toml"].length > 0 && facts.signals["requirements.txt"].length === 0) {
    commands.push("pip install -e .");
  }
  if (facts.signals["Cargo.toml"].length > 0) commands.push("cargo run");
  if (facts.signals["go.mod"].length > 0) commands.push("go run ./...");

  return commands;
}

function buildTestCommands(facts: RepoFacts) {
  const commands: string[] = [];
  const testScript = preferredTestScript(facts.manifest.packageScripts);

  if (testScript) {
    commands.push(commandForScript(facts.manifest.packageManager ?? "npm", testScript));
  }
  if (facts.signals.Tests.length > 0 && facts.signals["requirements.txt"].length > 0) {
    commands.push("pytest");
  }
  if (facts.signals["Cargo.toml"].length > 0) commands.push("cargo test");
  if (facts.signals["go.mod"].length > 0) commands.push("go test ./...");

  return Array.from(new Set(commands));
}

function markdownCodeBlock(lines: string[]) {
  return ["```bash", ...lines, "```"].join("\n");
}

function buildGeneratedReadme(facts: RepoFacts, issues: HealthIssue[]) {
  const title = `# ${facts.name}`;
  const description = facts.description ? `\n${facts.description}\n` : "\n> TODO: Add a concise project description based on the repository purpose.\n";
  const commands = buildCommands(facts);
  const testCommands = buildTestCommands(facts);
  const lines: string[] = [title, description.trim(), ""];

  lines.push("## What ShipReadme Verified", "");
  lines.push(`- Default branch: \`${facts.defaultBranch}\``);
  if (facts.signals["package.json"].length > 0) lines.push("- Runtime signal: `package.json`");
  if (facts.signals["pyproject.toml"].length > 0) lines.push("- Runtime signal: `pyproject.toml`");
  if (facts.signals["requirements.txt"].length > 0) lines.push("- Dependency signal: `requirements.txt`");
  if (facts.signals["Cargo.toml"].length > 0) lines.push("- Runtime signal: `Cargo.toml`");
  if (facts.signals["go.mod"].length > 0) lines.push("- Runtime signal: `go.mod`");
  if (facts.signals.Dockerfile.length > 0) lines.push("- Deployment signal: `Dockerfile`");
  if (facts.signals["docker-compose.yml"].length > 0) lines.push(`- Deployment signal: \`${facts.signals["docker-compose.yml"][0].path}\``);
  lines.push("");

  lines.push("## Quick Start", "");
  if (commands.length > 0) {
    lines.push(markdownCodeBlock(commands), "");
  } else {
    lines.push("> TODO: Add install and run commands after defining a package manifest or executable entry point.", "");
  }

  if (facts.signals[".env.example"].length > 0) {
    lines.push("## Configuration", "");
    lines.push(`Copy \`${facts.signals[".env.example"][0].path}\` before running locally:`, "");
    lines.push(markdownCodeBlock([`cp ${facts.signals[".env.example"][0].path} .env.local`]), "");
  }

  if (testCommands.length > 0) {
    lines.push("## Testing", "");
    lines.push(markdownCodeBlock(testCommands), "");
  }

  if (facts.signals.Dockerfile.length > 0 || facts.signals["docker-compose.yml"].length > 0) {
    lines.push("## Deployment", "");
    if (facts.signals["docker-compose.yml"].length > 0) {
      lines.push(markdownCodeBlock(["docker compose up --build"]), "");
    } else {
      lines.push(markdownCodeBlock([`docker build -t ${facts.name.toLowerCase()} .`]), "");
    }
  }

  if (facts.signals.Screenshots.length > 0) {
    lines.push("## Screenshots / Demo", "");
    lines.push(`![Project screenshot](${facts.signals.Screenshots[0].path})`, "");
  }

  lines.push("## README Health Notes", "");
  if (issues.length === 0) {
    lines.push("- No major README gaps were detected by ShipReadme.");
  } else {
    issues.slice(0, 8).forEach((issue) => {
      lines.push(`- ${issue.title}: ${issue.detail}`);
    });
  }
  lines.push("");

  if (facts.signals.LICENSE.length > 0) {
    lines.push("## License", "");
    lines.push(`See [${facts.signals.LICENSE[0].path}](./${facts.signals.LICENSE[0].path}).`, "");
  }

  lines.push("## Contributing", "");
  lines.push("Issues and pull requests are welcome. Please run the relevant checks above before submitting changes.", "");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** 根据仓库事实生成健康分、问题列表、分类报告和可复制 README 草案。 */
export function analyzeReadme(facts: RepoFacts): AnalyzeResult {
  const issues = buildIssues(facts);
  const categories = buildCategoryReports(facts, issues);
  const score = Math.max(0, Math.min(100, categories.reduce((total, category) => total + category.score, 0)));

  return {
    repository: {
      owner: facts.ref.owner,
      repo: facts.ref.repo,
      url: facts.ref.url,
      defaultBranch: facts.defaultBranch,
      description: facts.description,
      stars: facts.stars
    },
    score,
    missingItems: issues.map((issue) => issue.title),
    issues,
    categories,
    signals: facts.signals,
    generatedReadme: buildGeneratedReadme(facts, issues)
  };
}
