import { Component, type ErrorInfo, type ReactNode } from 'react'
import { downloadBackup } from '../backup'

interface Props {
  children: ReactNode
}

/**
 * Catches a crash on one page so the rest of the app (and the data) stays usable.
 * AppShell keys it on the path, so moving to another page clears the error.
 */
export class ErrorBoundary extends Component<Props, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="rounded-[20px] border border-line/70 bg-surface p-6">
        <h1 className="text-2xl font-bold">Something went wrong on this page</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Your data is safe: nothing is lost when a page fails to draw. Try another page or reload. If it keeps happening, download a backup so there’s a copy while it gets
          fixed.
        </p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-muted">{error.message}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => location.reload()} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">
            Reload
          </button>
          <button type="button" onClick={() => downloadBackup()} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Download backup
          </button>
          <a href="/" className="px-3 py-2 text-sm text-muted hover:text-text">
            Go home
          </a>
        </div>
      </div>
    )
  }
}
