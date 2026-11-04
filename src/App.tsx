import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { LogProvider } from './log/LogStore'
import Home from './pages/Home'
import LogHome from './pages/log/LogHome'
import Maxes from './pages/log/Maxes'
import { EditMultisport, MultisportDetail, NewMultisport } from './pages/log/Multisport'
import SessionDetail from './pages/log/SessionDetail'
import { EditSession, NewSession } from './pages/log/SessionForm'
import { WellbeingDetail, WellbeingForm } from './pages/log/Wellbeing'
import LibraryHome from './pages/library/LibraryHome'
import WorkoutDetail from './pages/library/WorkoutDetail'
import { EditWorkout, NewWorkout } from './pages/library/WorkoutForm'
import { Analysis } from './pages/Placeholders'
import { EditBlock, NewBlock } from './pages/plan/BlockForm'
import Events, { EditEvent, NewEvent } from './pages/plan/Events'
import PlanHome from './pages/plan/PlanHome'
import PlannedDetail, { EditPlanned, NewPlanned } from './pages/plan/PlannedDetail'
import Work from './pages/plan/Work'
import { PlanProvider } from './plan/PlanStore'
import Settings from './pages/Settings'
import { SettingsProvider } from './settings/SettingsContext'

export default function App() {
  return (
    <SettingsProvider>
      <LogProvider>
        <PlanProvider>
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
                </Route>
                <Route path="library">
                  <Route index element={<LibraryHome />} />
                  <Route path="new" element={<NewWorkout />} />
                  <Route path=":id" element={<WorkoutDetail />} />
                  <Route path=":id/edit" element={<EditWorkout />} />
                </Route>
                <Route path="analysis" element={<Analysis />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PlanProvider>
      </LogProvider>
    </SettingsProvider>
  )
}
