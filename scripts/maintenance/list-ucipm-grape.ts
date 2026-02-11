import { prisma } from "@/lib/prisma";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const sources = await prisma.source.findMany({
    where: { url: { contains: "ipm.ucanr.edu/agriculture/grape" } },
    select: { id: true, title: true, url: true },
    orderBy: { title: "asc" },
  });

  console.log(JSON.stringify(sources, null, 2));
}

main().catch((error) => {
  console.error("List failed:", error);
  process.exit(1);
});
