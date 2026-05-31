import { useState } from 'react'
import BookingForm   from '../components/forms/BookingForm'
import BookingsList  from '../components/bookings/BookingsList'

const TABS = [
  { id: 'add',  label: 'Add Booking' },
  { id: 'list', label: 'All Bookings' },
]

export default function BookingsPage() {
  const [tab, setTab] = useState('add')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'add'  && <BookingForm onSuccess={() => setTab('list')} />}
      {tab === 'list' && <BookingsList />}
    </div>
  )
}
