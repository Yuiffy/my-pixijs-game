import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  getRepoPath,
  getReposRoot,
  listConfiguredRepos,
  loadShardConfig,
} from './stream-shards.mjs';

if (!process.argv.includes('--initialize')) {
  throw new Error('Refusing to create local repositories without --initialize');
}
const config = loadShardConfig();
const reposRoot = getReposRoot();

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

fs.mkdirSync(reposRoot, { recursive: true });
for (const repo of listConfiguredRepos(config)) {
  const repoPath = getRepoPath(repo.repo, reposRoot);
  fs.mkdirSync(repoPath, { recursive: true });
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    const remaining = fs.readdirSync(repoPath);
    if (remaining.length) throw new Error(`Refusing to initialize non-empty directory: ${repoPath}`);
    git(repoPath, ['init', '--initial-branch=main']);
    git(repoPath, ['remote', 'add', 'origin', `https://github.com/${repo.repo}.git`]);
  }
  const title = repo.kind === 'index' ? 'Liver stream indexes' : `Liver stream assets (${repo.id})`;
  fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${title}\n\nGenerated stream data for the main site.\n`, 'utf8');
  fs.writeFileSync(
    path.join(repoPath, '.gitattributes'),
    '* text=auto\npublic/data/streams/** binary\n*.png binary\n*.jpg binary\n*.jpeg binary\n*.gif binary\n*.webp binary\n',
    'utf8',
  );
  console.log(`Prepared ${repo.repo} at ${repoPath}`);
}
