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
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Post Workflow</h1>
          <Link
            href={`/topics/${post.topicId}/trends`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
