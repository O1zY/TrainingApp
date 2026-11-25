import { useSyncStatus } from '../sync/runner'
import { syncConfigured } from '../sync/supabase'
import { useWelcomeSkipped } from './welcomeState'

/** True while the full-screen sign-in should cover the app: sync is set up, nobody's signed in, and it wasn't skipped. */
export function useWelcomeVisible() {
  const status = useSyncStatus()
  const skipped = useWelcomeSkipped()
  return syncConfigured && status.state === 'off' && !skipped
}
