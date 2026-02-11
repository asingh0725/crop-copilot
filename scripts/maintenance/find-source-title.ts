import { prisma } from "@/lib/prisma";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const term = process.argv[2] || "eutypa";
  const sources = await prisma.source.findMany({
    where: {
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { url: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, url: true },
  });
  console.log(JSON.stringify(sources, null, 2));
}

main().catch((error) => {
  console.error("Find failed:", error);
  process.exit(1);
});
