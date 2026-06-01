"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileCode2,
  Github,
  Loader2,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalyzeResult, CategoryReport, HealthIssue, SignalName } from "@/lib/types";

type ScanState = "idle" | "scanning" | "done" | "error";

const signalLabels: SignalName[] = [
  "README",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Dockerfile",
  "docker-compose.yml",
  ".env.example",
  "LICENSE",
  "Tests",
  "CI",
  "Screenshots"
];

function scoreTone(score: number) {
  if (score >= 80) return "text-ok";
  if (score >= 55) return "text-warn";
  return "text-red-700";
}

function statusText(status: CategoryReport["status"]) {
  return status === "pass" ? "Pass" : status === "warn" ? "Needs work" : "Fail";
}

function statusClass(status: CategoryReport["status"]) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function issueSeverityClass(severity: HealthIssue["severity"]) {
  if (severity === "high") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function MarkdownPreview({ value }: { value: string }) {
  const blocks = useMemo(() => value.split(/\n\n+/), [value]);

  return (
    <div className="space-y-4 text-sm leading-6 text-slate-800">
      {blocks.map((block, index) => {
        if (block.startsWith("```")) {
          return (
            <pre key={index} className="overflow-auto rounded-lg bg-terminal p-4 font-mono text-[13px] leading-5 text-slate-100">
              {block.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "")}
            </pre>
          );
        }

        if (block.startsWith("# ")) {
          return (
            <h1 key={index} className="text-2xl font-bold text-ink">
              {block.replace(/^# /, "")}
            </h1>
          );
        }

        if (block.startsWith("## ")) {
          return (
            <h2 key={index} className="border-b border-line pb-2 text-lg font-semibold text-ink">
              {block.replace(/^## /, "")}
            </h2>
          );
        }

        if (block.startsWith("- ")) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.split("\n").map((line) => (
                <li key={line}>{line.replace(/^- /, "")}</li>
              ))}
            </ul>
          );
        }

        if (block.startsWith("> ")) {
          return (
            <blockquote key={index} className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-amber-900">
              {block.replace(/^> /, "")}
            </blockquote>
          );
        }

        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

function TerminalStatus({ state }: { state: ScanState }) {
  const lines =
    state === "scanning"
      ? ["validating repository url", "fetching default branch tree", "reading README and manifests", "building evidence report"]
      : ["ready for repository input", "no login required", "public GitHub REST API"];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-terminal text-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 font-mono text-xs text-slate-400">shipreadme.scan</span>
      </div>
      <div className="space-y-2 p-4 font-mono text-[13px] leading-5">
        {lines.map((line, index) => (
          <div key={line} className="flex items-center gap-2">
            <span className="text-emerald-300">$</span>
            <span>{line}</span>
            {state === "scanning" && index === lines.length - 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("preview");

  async function analyze() {
    setState("scanning");
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl })
      });
      const payload = (await response.json()) as AnalyzeResult | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "分析失败，请稍后重试。");
      }

      const analysis = payload as AnalyzeResult;
      setResult(analysis);
      setDraft(analysis.generatedReadme);
      setState("done");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "分析失败，请稍后重试。");
      setState("error");
    }
  }

  async function copyReadme() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="label-caps mb-2">Self-hosted README auditor</div>
            <h1 className="text-[32px] font-bold leading-10 tracking-normal text-ink">ShipReadme</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              输入公开 GitHub 仓库，基于真实文件信号生成 README 健康报告和一版可复制的修复草案。
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-ok" />
            No OAuth · Rules first
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="label-caps">Repository intake</div>
                <h2 className="mt-1 text-xl font-semibold text-ink">扫描公开仓库</h2>
              </div>
              <Github className="h-6 w-6 text-slate-500" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void analyze();
                }}
                className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-ink focus:ring-1 focus:ring-ink"
                placeholder="https://github.com/owner/repo"
              />
              <button
                onClick={() => void analyze()}
                disabled={state === "scanning"}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state === "scanning" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Analyze
              </button>
            </div>

            {error ? (
              <div className="mt-4 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <TerminalStatus state={state} />
        </section>

        {result ? (
          <>
            <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <aside className="panel p-5">
                <div className="label-caps">Health score</div>
                <div className={`mt-3 text-6xl font-bold leading-none ${scoreTone(result.score)}`}>{result.score}</div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-ink transition-all" style={{ width: `${result.score}%` }} />
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <a className="inline-flex items-center gap-1 font-semibold text-ink" href={result.repository.url} target="_blank" rel="noreferrer">
                    {result.repository.owner}/{result.repository.repo}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p>Default branch: <span className="font-mono">{result.repository.defaultBranch}</span></p>
                  <p>Stars: <span className="font-mono">{result.repository.stars}</span></p>
                </div>
              </aside>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {result.categories.map((category) => (
                  <div key={category.category} className="panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="label-caps">{category.category}</div>
                        <div className="mt-2 text-sm font-semibold text-ink">{category.summary}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${statusClass(category.status)}`}>
                        {statusText(category.status)}
                      </span>
                    </div>
                    {category.evidence[0] ? (
                      <div className="mt-3 border-l-4 border-emerald-500 bg-slate-50 px-3 py-2">
                        <div className="font-mono text-[12px] text-slate-900">{category.evidence[0].file}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">{category.evidence[0].note}</div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="panel p-5">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warn" />
                  <h2 className="text-lg font-semibold text-ink">问题与证据</h2>
                </div>
                <div className="space-y-3">
                  {result.issues.length === 0 ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      未发现主要 README 风险。
                    </div>
                  ) : (
                    result.issues.map((issue) => (
                      <div key={`${issue.category}-${issue.title}`} className="rounded-lg border border-line bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase ${issueSeverityClass(issue.severity)}`}>
                            {issue.severity}
                          </span>
                          <span className="label-caps">{issue.category}</span>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-ink">{issue.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{issue.detail}</p>
                        <div className="mt-3 space-y-2">
                          {issue.evidence.map((item) => (
                            <div key={`${issue.title}-${item.file}-${item.note}`} className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2">
                              <div className="font-mono text-[12px] text-amber-950">{item.file}</div>
                              <div className="mt-1 text-xs leading-5 text-amber-900">{item.note}</div>
                              {item.matched ? <div className="mt-1 font-mono text-[12px] text-amber-950">{item.matched}</div> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="panel p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="label-caps">Signals</div>
                    <h2 className="mt-1 text-lg font-semibold text-ink">关键文件命中</h2>
                  </div>
                  <button
                    onClick={() => {
                      setRepoUrl("");
                      setResult(null);
                      setDraft("");
                      setState("idle");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {signalLabels.map((signal) => {
                    const files = result.signals[signal] ?? [];
                    return (
                      <div key={signal} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {files.length > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /> : <FileCode2 className="h-4 w-4 shrink-0 text-slate-400" />}
                          <span className="truncate text-sm font-medium text-slate-800">{signal}</span>
                        </div>
                        <span className="font-mono text-xs text-muted">{files.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="panel p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="label-caps">Rewrite workspace</div>
                  <h2 className="mt-1 text-lg font-semibold text-ink">README 修复草案</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex rounded-lg border border-line bg-slate-50 p-1">
                    <button
                      onClick={() => setTab("edit")}
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === "edit" ? "bg-white text-ink" : "text-muted"}`}
                    >
                      <TerminalSquare className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => setTab("preview")}
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === "preview" ? "bg-white text-ink" : "text-muted"}`}
                    >
                      <Play className="h-4 w-4" />
                      Preview
                    </button>
                  </div>
                  <button
                    onClick={() => void copyReadme()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Clipboard className="h-4 w-4" />
                    {copied ? "Copied" : "Copy Markdown"}
                  </button>
                </div>
              </div>

              {tab === "edit" ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-[520px] w-full resize-y rounded-lg border border-line bg-slate-950 p-4 font-mono text-[13px] leading-6 text-slate-100 outline-none focus:border-ink focus:ring-1 focus:ring-ink"
                  spellCheck={false}
                />
              ) : (
                <div className="min-h-[520px] rounded-lg border border-line bg-white p-5">
                  <MarkdownPreview value={draft} />
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
