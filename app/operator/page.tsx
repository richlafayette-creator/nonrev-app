import { execSync } from 'node:child_process'
import packageJson from '../../package.json'
import OperatorBetaDashboard from './OperatorBetaDashboard'

export const dynamic = 'force-dynamic'

function currentCommitHash() {
  const envCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA
  if (envCommit) return envCommit.slice(0, 12)

  try {
    return execSync('git rev-parse --short=12 HEAD', { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

export default function OperatorPage() {
  return <OperatorBetaDashboard buildVersion={packageJson.version} commitHash={currentCommitHash()} />
}
