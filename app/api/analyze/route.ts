import { NextResponse } from "next/server";
import { analyzeReadme } from "@/lib/readme-analyzer";
import { collectRepoFacts, GithubAnalyzeError, parseGithubUrl } from "@/lib/github";

export const runtime = "nodejs";

interface AnalyzeRequest {
  url?: string;
}

/** README 诊断入口：校验 URL、采集 GitHub 事实，并返回规则引擎产物。 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "请输入 GitHub 仓库 URL。" }, { status: 400 });
    }

    const ref = parseGithubUrl(body.url);
    const facts = await collectRepoFacts(ref);
    const result = analyzeReadme(facts);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GithubAnalyzeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("README 诊断失败: ", error);
    return NextResponse.json({ error: "README 诊断失败，请稍后重试。" }, { status: 500 });
  }
}
