import { PrismaClient } from '../src/generated/prisma';
import { isValidFormat, type LyricFormat } from '../api/utils';
import { promises as fs } from 'fs';
import path from 'path';
import pLimit from 'p-limit';

const prisma = new PrismaClient();

const rootDir = process.argv[2] || 'lyrics-db/ncm-lyrics';
const limit = pLimit(10);

async function processFile(filePath: string) {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^(\d+)\.(\w+)$/);
  if (!match) return;
  const [, trackId, fmtStr] = match;
  if (!isValidFormat(fmtStr)) return; // skip unknown formats
  const format: LyricFormat = fmtStr;

  const content = await fs.readFile(filePath, 'utf8');

  // 先查现有记录，内容相同就跳过
  const existing = await prisma.lyric.findUnique({
    where: { trackId_format: { trackId, format } },
    select: { content: true },
  });
  if (existing?.content === content) return; // 无变化

  await prisma.lyric.upsert({
    where: { trackId_format: { trackId, format } },
    create: { trackId, format, content, source: 'repository' },
    update: { content },
  });
}

async function walk(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return limit(() => processFile(full));
    }),
  );
}

walk(rootDir)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  }); 