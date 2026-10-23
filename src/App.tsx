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
import { Analysis, Library, Plan } from './pages/Placeholders'
import Settings from './pages/Settings'
import { SettingsProvider } from './settings/SettingsContext'

export default function App() {
  return (
    <SettingsProvider>
      <LogProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="plan" element={<Plan />} />
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
              <Route path="library" element={<Library />} />
              <Route path="analysis" element={<Analysis />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LogProvider>
    </SettingsProvider>
  )
}
