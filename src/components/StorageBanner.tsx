import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dismissProblems, useStorageProblems } from '../storage'

/** Tells the user when saving failed or a save couldn't be read, instead of failing quietly. */
export function StorageBanner() {
  const problems = useStorageProblems()
  if (!problems.length) return null
  const write = problems.some((p) => p.kind === 'write')
  const corrupt = problems.filter((p) => p.kind === 'corrupt')

  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-[20px] border border-over/40 bg-over/15 p-4 text-sm">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-over" />
      <div className="flex-1 space-y-1">
        {write && (
          <p>
            <strong>Changes aren’t being saved.</strong> The browser’s storage is full or blocked (private browsing?). Anything new will be lost when this tab closes.{' '}
            <Link to="/settings" className="font-semibold underline">
              Download a backup
            </Link>{' '}
            now.
          </p>
        )}
        {corrupt.length > 0 && (
          <p>
            <strong>Some saved data couldn’t be read</strong> and was set aside rather than deleted ({corrupt.map((p) => p.savedAs ?? p.key).join(', ')}). If something’s missing,
            restore your latest backup from Settings.
          </p>
        )}
      </div>
      {!write && (
        <button type="button" onClick={dismissProblems} className="text-muted hover:text-text">
          Dismiss
        </button>
      )}
    </div>
  )
}
