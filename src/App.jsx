import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout           from './components/layout/Layout'
import OverviewPage     from './pages/OverviewPage'
import BookingsPage     from './pages/BookingsPage'
import ExpensesPage     from './pages/ExpensesPage'
import UnitPage         from './pages/UnitPage'
import PlatformsPage    from './pages/PlatformsPage'
import MaintenancePage  from './pages/MaintenancePage'
import ImportPage       from './pages/ImportPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index               element={<OverviewPage />} />
          <Route path="bookings"     element={<BookingsPage />} />
          <Route path="expenses"     element={<ExpensesPage />} />
          <Route path="unit"         element={<UnitPage />} />
          <Route path="platforms"    element={<PlatformsPage />} />
          <Route path="maintenance"  element={<MaintenancePage />} />
          <Route path="import"       element={<ImportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
