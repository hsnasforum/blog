import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkflowEditor } from "@/components/workflow-editor";
import { prisma } from "@/lib/prisma";

function normalizeStep(step: string): "outline" | "draft" | "review" | "approved" {
  if (step === "outline" || step === "draft" || step === "review" || step === "approved") {
    return step;
  }
  return "outline";
}

export default async function PostWorkflowPage({ params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      topic: true,
      candidate: true,
    },
  });

  if (!post) notFound();

  return (
    <div className="space-y-4">
      <header className="hero-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="badge badge-accent">Post Workflow</span>
            <h1 className="mt-3 text-xl font-bold text-slate-900">초안 작성 워크플로우</h1>
          </div>
          <Link
            href={`/topics/${post.topicId}/trends`}
            className="btn"
          >
            Trend Scout로 돌아가기
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          topic: <span className="font-medium text-slate-800">{post.topic.rawTopic}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          candidate: <span className="font-medium text-slate-800">{post.candidate?.keyword ?? "-"}</span>
        </p>
      </header>

      <WorkflowEditor
        initialPost={{
          id: post.id,
          title: post.title,
          angle: post.angle,
          outline: post.outline,
          draft: post.draft,
          reviewReport: post.reviewReport,
          seoPackage: post.seoPackage,
          workflowStep: normalizeStep(post.workflowStep),
        }}
      />
    </div>
  );
}
