import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { countryFlag, countryName } from '../../data/countries'
import BookingForm from '../forms/BookingForm'

const nightsCount = (cin, cout) =>
  Math.round((new Date(cout) - new Date(cin)) / 86_400_000)

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })

const STATUS_BADGE = {
  confirmed: 'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-600',
}

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'

function SortTh({ label, k, right, sortKey, sortDir, onSort }) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onSort(k)}
      className={`${right ? 'text-right' : 'text-left'} px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap`}
    >
      {label}{active ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )
}

export default function BookingsList() {
  const [units,      setUnits]      = useState([])
  const [platforms,  setPlatforms]  = useState([])
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // server-side filters
  const [unitId,     setUnitId]     = useState('')
  const [platformId, setPlatformId] = useState('')
  const [status,     setStatus]     = useState('')
  const [cinFrom,    setCinFrom]    = useState('')
  const [cinTo,      setCinTo]      = useState('')
  const [bookFrom,   setBookFrom]   = useState('')
  const [bookTo,     setBookTo]     = useState('')

  // client-side filters
  const [guestCountry, setGuestCountry] = useState('')
  const [search,       setSearch]       = useState('')

  // sort
  const [sortKey, setSortKey] = useState('check_in_date')
  const [sortDir, setSortDir] = useState(-1)

  // edit / delete
  const [editRow,    setEditRow]    = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('id, name').order('name'),
      supabase.from('platforms').select('id, name').order('name'),
    ]).then(([{ data: u }, { data: p }]) => {
      setUnits(u ?? [])
      setPlatforms(p ?? [])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      let q = supabase
        .from('bookings')
        .select('id, unit_id, platform_id, guest_name, booking_date, booking_ref, check_in_date, check_out_date, gross_amount, net_payout, platform_fee, other_fees, payment_credit_date, status, guest_country, guest_city, notes, units(name), platforms(name)')
        .order('check_in_date', { ascending: false })
        .limit(500)

      if (unitId)     q = q.eq('unit_id', unitId)
      if (platformId) q = q.eq('platform_id', platformId)
      if (status)     q = q.eq('status', status)
      if (cinFrom)    q = q.gte('check_in_date', cinFrom)
      if (cinTo)      q = q.lte('check_in_date', cinTo)
      if (bookFrom)   q = q.gte('booking_date', bookFrom)
      if (bookTo)     q = q.lte('booking_date', bookTo)

      const { data, error: e } = await q
      if (cancelled) return
      if (e) setError(e.message)
      else setRows(data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [unitId, platformId, status, cinFrom, cinTo, bookFrom, bookTo, refreshKey])

  const countryOptions = useMemo(() =>
    [...new Set(rows.map(r => r.guest_country).filter(Boolean))].sort()
  , [rows])

  const filtered = useMemo(() => {
    let result = rows

    if (guestCountry) result = result.filter(r => r.guest_country === guestCountry)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.guest_name?.toLowerCase().includes(q) ||
        r.guest_country?.toLowerCase().includes(q) ||
        countryName(r.guest_country).toLowerCase().includes(q) ||
        r.guest_city?.toLowerCase().includes(q) ||
        r.booking_ref?.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (sortKey === 'gross_amount' || sortKey === 'net_payout') {
        return sortDir * ((parseFloat(bv) || 0) - (parseFloat(av) || 0))
      }
      return sortDir * String(av).localeCompare(String(bv))
    })
  }, [rows, guestCountry, search, sortKey, sortDir])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  async function handleDelete(id) {
    if (deletingId !== id) { setDeletingId(id); return }
    const { error: e } = await supabase.from('bookings').delete().eq('id', id)
    if (e) { setError(e.message); setDeletingId(null); return }
    setRows(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  const sp = { sortKey, sortDir, onSort: handleSort }

  return (
    <div>
      {/* Filters row 1 — dropdowns */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Unit</p>
          <select value={unitId} onChange={e => setUnitId(e.target.value)} className={inputCls}>
            <option value="">All units</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Platform</p>
          <select value={platformId} onChange={e => setPlatformId(e.target.value)} className={inputCls}>
            <option value="">All platforms</option>
            {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Status</p>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Country</p>
          <select value={guestCountry} onChange={e => setGuestCountry(e.target.value)} className={inputCls}>
            <option value="">All countries</option>
            {countryOptions.map(c => (
              <option key={c} value={c}>{countryFlag(c)} {countryName(c)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters row 2 — date ranges + search */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Check-in from</p>
          <input type="date" value={cinFrom} max={cinTo || undefined}
            onChange={e => setCinFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Check-in to</p>
          <input type="date" value={cinTo} min={cinFrom || undefined}
            onChange={e => setCinTo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Booked from</p>
          <input type="date" value={bookFrom} max={bookTo || undefined}
            onChange={e => setBookFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Booked to</p>
          <input type="date" value={bookTo} min={bookFrom || undefined}
            onChange={e => setBookTo(e.target.value)} className={inputCls} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Search</p>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Guest, ref, country, city…" className={`${inputCls} w-full`} />
        </div>
        {loading && <span className="text-sm text-gray-400 self-end pb-2">Loading…</span>}
        {!loading && (
          <span className="text-sm text-gray-400 self-end pb-2">
            {filtered.length} booking{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <SortTh label="Guest"     k="guest_name"   {...sp} />
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Origin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Platform</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Ref</th>
                <SortTh label="Booked"    k="booking_date" right {...sp} />
                <SortTh label="Check-in"  k="check_in_date"     right {...sp} />
                <SortTh label="Check-out" k="check_out_date"    right {...sp} />
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Nights</th>
                <SortTh label="Gross"     k="gross_amount" right {...sp} />
                <SortTh label="Net"       k="net_payout"   right {...sp} />
                <SortTh label="Status"    k="status"       {...sp} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => {
                const n = nightsCount(r.check_in_date, r.check_out_date)
                const isDeleting = deletingId === r.id
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {r.guest_name ?? <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.guest_country ? (
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-base leading-none">{countryFlag(r.guest_country)}</span>
                          <span className="text-gray-700">{countryName(r.guest_country)}</span>
                          {r.guest_city && <span className="text-gray-400 text-xs">· {r.guest_city}</span>}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.units?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.platforms?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {r.booking_ref ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs">
                      {r.booking_date ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{r.check_in_date}</td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{r.check_out_date}</td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{n}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{usd.format(r.gross_amount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{usd.format(r.net_payout)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          onClick={() => { setEditRow(r); setDeletingId(null) }}
                          className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          onBlur={() => { if (deletingId === r.id) setTimeout(() => setDeletingId(null), 150) }}
                          className={`text-xs font-medium transition-colors ${isDeleting ? 'text-red-600 font-semibold' : 'text-gray-400 hover:text-red-500'}`}
                        >
                          {isDeleting ? 'Confirm?' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-gray-400">
                    No bookings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editRow && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setEditRow(null) }}
        >
          <div className="my-8 w-full max-w-2xl">
            <BookingForm
              editData={editRow}
              onSuccess={() => { setEditRow(null); setRefreshKey(k => k + 1) }}
              onCancel={() => setEditRow(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
