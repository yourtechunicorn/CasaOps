import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/',             label: 'Overview',       icon: '📊' },
  { to: '/bookings',     label: 'Bookings',       icon: '📅' },
  { to: '/expenses',     label: 'Add Expense',    icon: '💸' },
  { to: '/unit',         label: 'Unit Dashboard', icon: '🏠' },
  { to: '/platforms',    label: 'Platforms',      icon: '🔗' },
  { to: '/maintenance',  label: 'Maintenance',    icon: '🔧' },
  { to: '/import',      label: 'Import',         icon: '📥' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="px-5 py-6 border-b border-gray-100">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">CasaOps</p>
        <h1 className="text-lg font-bold text-gray-900 mt-0.5">STR Tracker</h1>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
