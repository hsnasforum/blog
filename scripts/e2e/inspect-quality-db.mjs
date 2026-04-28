import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const posts = await prisma.post.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    title: true,
    outline: true,
    draft: true,
    reviewReport: true,
    seoPackage: true,
    workflowStep: true,
    createdAt: true,
  },
});
const logs = await prisma.generationLog.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    action: true,
    model: true,
    generationStatus: true,
    inputSummary: true,
    errorMessage: true,
    createdAt: true,
  },
});
console.log(JSON.stringify({ posts, logs }, null, 2));
await prisma.$disconnect();
