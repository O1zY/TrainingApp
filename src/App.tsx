import { lazy, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { LogProvider } from './log/LogStore'
import { PlanProvider } from './plan/PlanStore'
import { SettingsProvider } from './settings/SettingsContext'
import { StravaProvider } from './strava/StravaStore'

// Each page loads when first opened, so the first screen doesn't wait for every chart and form.
// `pick` turns a named export into the default export lazy() wants.
const pick = <M, K extends keyof M>(load: () => Promise<M>, name: K) => lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))

const Home = lazy(() => import('./pages/Home'))
const LogHome = lazy(() => import('./pages/log/LogHome'))
const Maxes = lazy(() => import('./pages/log/Maxes'))
const multisport = () => import('./pages/log/Multisport')
const NewMultisport = pick(multisport, 'NewMultisport')
const EditMultisport = pick(multisport, 'EditMultisport')
const MultisportDetail = pick(multisport, 'MultisportDetail')
const SessionDetail = lazy(() => import('./pages/log/SessionDetail'))
const sessionForm = () => import('./pages/log/SessionForm')
const NewSession = pick(sessionForm, 'NewSession')
const EditSession = pick(sessionForm, 'EditSession')
const wellbeing = () => import('./pages/log/Wellbeing')
const WellbeingDetail = pick(wellbeing, 'WellbeingDetail')
const WellbeingForm = pick(wellbeing, 'WellbeingForm')
const LibraryHome = lazy(() => import('./pages/library/LibraryHome'))
const WorkoutDetail = lazy(() => import('./pages/library/WorkoutDetail'))
const workoutForm = () => import('./pages/library/WorkoutForm')
const NewWorkout = pick(workoutForm, 'NewWorkout')
const EditWorkout = pick(workoutForm, 'EditWorkout')
const AnalysisHome = lazy(() => import('./pages/analysis/AnalysisHome'))
const blockForm = () => import('./pages/plan/BlockForm')
const NewBlock = pick(blockForm, 'NewBlock')
const EditBlock = pick(blockForm, 'EditBlock')
const events = () => import('./pages/plan/Events')
const Events = lazy(events)
const NewEvent = pick(events, 'NewEvent')
const EditEvent = pick(events, 'EditEvent')
const PlanHome = lazy(() => import('./pages/plan/PlanHome'))
const plannedDetail = () => import('./pages/plan/PlannedDetail')
const PlannedDetail = lazy(plannedDetail)
const NewPlanned = pick(plannedDetail, 'NewPlanned')
const EditPlanned = pick(plannedDetail, 'EditPlanned')
const Work = lazy(() => import('./pages/plan/Work'))
const Settings = lazy(() => import('./pages/Settings'))
const strava = () => import('./pages/log/Strava')
const StravaPage = lazy(strava)
const StravaCallback = pick(strava, 'StravaCallback')

export default function App() {
  return (
    <SettingsProvider>
      <LogProvider>
        <PlanProvider>
          <StravaProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="plan">
                    <Route index element={<PlanHome />} />
                    <Route path="block/new" element={<NewBlock />} />
                    <Route path="block/:id/edit" element={<EditBlock />} />
                    <Route path="work" element={<Work />} />
                    <Route path="events" element={<Events />} />
                    <Route path="events/new" element={<NewEvent />} />
                    <Route path="events/:id/edit" element={<EditEvent />} />
                    <Route path="session/new" element={<NewPlanned />} />
                    <Route path="session/:id" element={<PlannedDetail />} />
                    <Route path="session/:id/edit" element={<EditPlanned />} />
                  </Route>
                  <Route path="log">
                    <Route index element={<LogHome />} />
                    <Route path="new" element={<NewSession />} />
                    <Route path="session/:id" element={<SessionDetail />} />
                    <Route path="session/:id/edit" element={<EditSession />} />
                    <Route path="multi/new" element={<NewMultisport />} />
                    <Route path="multi/:id" element={<MultisportDetail />} />
                    <Route path="multi/:id/edit" element={<EditMultisport />} />
                    <Route path="wellbeing/:date" element={<WellbeingDetail />} />
                    <Route path="wellbeing/:date/edit" element={<WellbeingForm />} />
                    <Route path="maxes" element={<Maxes />} />
                    <Route path="strava" element={<StravaPage />} />
                  </Route>
                  <Route path="library">
                    <Route index element={<LibraryHome />} />
                    <Route path="new" element={<NewWorkout />} />
                    <Route path=":id" element={<WorkoutDetail />} />
                    <Route path=":id/edit" element={<EditWorkout />} />
                  </Route>
                  <Route path="analysis" element={<AnalysisHome />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="strava/callback" element={<StravaCallback />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </StravaProvider>
        </PlanProvider>
      </LogProvider>
    </SettingsProvider>
  )
}
