import {execFileSync} from 'node:child_process';
import {existsSync, rmSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const USAGE = 'usage: tsx scripts/approve.ts <slug> [--revoke]'; const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function fail(message: string): never { process.stderr.write(`${message}\n`); process.exit(1); }
const [slug, flag, ...extra] = process.argv.slice(2); if (!slug || !slugPattern.test(slug) || extra.length > 0 || (flag && flag !== '--revoke')) fail(USAGE); const root = process.cwd(); const videoDir = resolve(root, 'videos', slug); if (!existsSync(videoDir)) fail(`video directory not found: videos/${slug}`); const approvalPath = resolve(videoDir, 'APPROVED');
if (flag === '--revoke') { if (existsSync(approvalPath)) rmSync(approvalPath); process.stdout.write(`approval revoked: videos/${slug}/APPROVED\n`); } else { const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(); writeFileSync(approvalPath, `approvedAt: ${new Date().toISOString()}\ngitHead: ${head}\n`, 'utf8'); process.stdout.write(`approved: videos/${slug}/APPROVED\n`); }
