import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { IntroPage } from './pages/IntroPage'
import { OverviewPage } from './pages/OverviewPage'
import { LiveDetectionPage } from './pages/LiveDetectionPage'
import { RobotControlPage } from './pages/RobotControlPage'
import { FieldMapPage } from './pages/FieldMapPage'
import { DetectionHistoryPage } from './pages/DetectionHistoryPage'
import { SystemPage } from './pages/SystemPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<IntroPage />} />
          <Route path="intro" element={<IntroPage />} />
          <Route path="app" element={<OverviewPage />} />
          <Route path="app/live" element={<LiveDetectionPage />} />
          <Route path="app/robot" element={<RobotControlPage />} />
          <Route path="app/field" element={<FieldMapPage />} />
          <Route path="app/history" element={<DetectionHistoryPage />} />
          <Route path="app/system" element={<SystemPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
