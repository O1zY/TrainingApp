import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import Home from './pages/Home'
import { Analysis, Library, Log, Plan } from './pages/Placeholders'
import Settings from './pages/Settings'
import { SettingsProvider } from './settings/SettingsContext'

export default function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="plan" element={<Plan />} />
            <Route path="log" element={<Log />} />
            <Route path="library" element={<Library />} />
            <Route path="analysis" element={<Analysis />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  )
}
