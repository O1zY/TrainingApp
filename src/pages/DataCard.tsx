import { Download, ShieldCheck, ShieldAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card } from '../components/ui'
import { daysSinceBackup, downloadBackup, parseBackup, readMeta, restoreBackup, summarise, type Backup } from '../backup'
import { formatDate } from '../log/format'
import { storageInfo } from '../storage'

const btn = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:bg-surface-2'
const primary = 'inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110'

function mb(bytes?: number) {
  return bytes === undefined ? '–' : bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} kB` : `${(bytes / 1_000_000).toFixed(1)} MB`
}

function lastBackupText(meta = readMeta()) {
  const days = daysSinceBackup(meta)
  if (days === undefined) return 'No backup made in this browser yet.'
  if (days === 0) return 'Last backup today.'
  return `Last backup ${days} day${days === 1 ? '' : 's'} ago.`
}

/** Settings › Your data: backups, restore, and whether the browser will keep the data. */
export function DataCard() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof storageInfo>>>({})
  const [last, setLast] = useState(lastBackupText)
  const [pending, setPending] = useState<Backup>()
  const [error, setError] = useState<string>()
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    storageInfo().then(setInfo)
  }, [])

  const backup = () => {
    downloadBackup()
    setLast(lastBackupText())
  }

  const choose = async (f: File | undefined) => {
    setError(undefined)
    setPending(undefined)
    if (!f) return
    try {
      setPending(parseBackup(await f.text()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    if (file.current) file.current.value = ''
  }

  const restore = () => {
    if (!pending) return
    try {
      restoreBackup(pending)
      location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const s = pending && summarise(pending)

  return (
    <Card title="Your data">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Everything is saved in this browser only. Download a backup now and then: it’s the only copy if the browser’s data is cleared, and it moves your log to another
          device. Strava sign-in isn’t included; reconnect after restoring somewhere new.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} onClick={backup}>
            <Download className="size-4" /> Download backup
          </button>
          <button type="button" className={btn} onClick={() => file.current?.click()}>
            <Upload className="size-4" /> Restore from backup…
          </button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          <span className="text-sm text-muted">{last}</span>
        </div>

        {error && <p className="rounded-lg bg-miss/15 px-3 py-2 text-sm">{error}</p>}

        {s && (
          <div className="rounded-xl border border-line p-4">
            <p className="font-semibold">Restore this backup?</p>
            <p className="mt-1 text-sm text-muted">
              {s.exportedAt ? `Made ${formatDate(s.exportedAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}. ` : ''}
              {s.sessions} sessions{s.firstDate && s.lastDate ? ` (${formatDate(s.firstDate)} – ${formatDate(s.lastDate)})` : ''}, {s.checkIns} check-ins, {s.workouts} library workouts,{' '}
              {s.blocks} blocks and {s.planned} planned sessions.
            </p>
            <p className="mt-2 text-sm">
              This <strong>replaces</strong> everything in this browser. Download a backup of what’s here first if you might want it back.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={backup}>
                <Download className="size-4" /> Back up current data
              </button>
              <button type="button" className="rounded-full bg-miss px-3.5 py-1.5 text-sm font-semibold text-white hover:brightness-110" onClick={restore}>
                Replace and restore
              </button>
              <button type="button" className="px-3 py-1.5 text-sm text-muted hover:text-text" onClick={() => setPending(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 border-t border-line pt-4 text-sm">
          {info.persisted ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-hit" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-over" />}
          <p className="text-muted">
            {info.persisted
              ? 'The browser has agreed to keep this data, even when space runs low.'
              : 'The browser hasn’t promised to keep this data: it may clear it if the device runs low on space, or (Safari) after weeks without a visit. Regular backups are the safe option.'}{' '}
            Using {mb(info.usage)}.
          </p>
        </div>
      </div>
    </Card>
  )
}
