import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { COUNTRIES } from '../../data/countries'

// ── parse helpers ─────────────────────────────────────────────────────────────

function pickRaw(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== '') return v
  }
  return null
}

function parseDate(v) {
  if (!v) return ''
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // M/D/YYYY or MM/DD/YYYY  (Airbnb)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`

  // D Month YYYY  e.g. "15 January 2025"
  const dmy = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (dmy) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }
    const m = months[dmy[2].toLowerCase().slice(0, 3)]
    if (m) return `${dmy[3]}-${String(m).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  const dt = new Date(s)
  return isNaN(dt) ? '' : dt.toISOString().slice(0, 10)
}

function parseAmount(v) {
  if (typeof v === 'number') return v
  if (!v) return 0
  return parseFloat(String(v).replace(/[$,\s()]/g, '')) || 0
}

function countryCodeFromName(name) {
  if (!name) return null
  const n = name.trim().toLowerCase()
  const match = COUNTRIES.find(c => c.name.toLowerCase() === n)
    ?? COUNTRIES.find(c => c.name.toLowerCase().startsWith(n))
  return match?.code ?? null
}

function normalizeStatus(raw, skips = ['cancel']) {
  const s = (raw ?? '').toLowerCase()
  if (skips.some(k => s.includes(k))) return 'cancelled'
  if (s.includes('pend') || s.includes('inquir')) return 'pending'
  return 'confirmed'
}

function mapAirbnbRow(raw) {
  const gross  = parseAmount(pickRaw(raw, 'Total', 'Gross Earnings', 'gross_earnings', 'Revenue'))
  const payout = parseAmount(pickRaw(raw, 'Payout', 'Amount', 'Net Revenue', 'net_revenue'))
  const fee    = parseAmount(pickRaw(raw, 'Service Fee', 'Host Fee', 'Platform Fee', 'Commission'))
  return {
    booking_ref:         String(pickRaw(raw, 'Confirmation Code', 'confirmation_code', 'Reservation ID', 'Code') ?? ''),
    booking_date:        parseDate(pickRaw(raw, 'Booked', 'Date Submitted', 'Submission Date', 'Created', 'Date')),
    check_in_date:            parseDate(pickRaw(raw, 'Start Date', 'Check-in', 'Arrival Date', 'arrival')),
    check_out_date:           parseDate(pickRaw(raw, 'End Date', 'Check-out', 'Departure Date', 'departure')),
    guest_name:          String(pickRaw(raw, 'Guest Name', 'guest_name', 'Name') ?? ''),
    guest_country:       null,
    status:              normalizeStatus(pickRaw(raw, 'Status', 'status', 'Reservation Status')),
    gross_amount:        gross,
    platform_fee:        fee || (gross > 0 && payout > 0 ? Math.max(0, gross - payout) : 0),
    net_payout:          payout,
    payment_credit_date: parseDate(pickRaw(raw, 'Payout Date', 'Paid Out Date', 'payout_date')),
    _listing:            String(pickRaw(raw, 'Listing', 'listing', 'Property', 'property', 'Unit') ?? ''),
  }
}

function mapBookingRow(raw) {
  const gross  = parseAmount(pickRaw(raw, 'Gross booking value', 'Total revenue', 'Gross Revenue', 'Revenue', 'Total'))
  const comm   = parseAmount(pickRaw(raw, 'Commission', 'Commission amount', 'Service charge'))
  const net    = parseAmount(pickRaw(raw, 'Net booking value', 'Net revenue', 'Net Revenue', 'Payout'))
  const country = String(pickRaw(raw, 'Country', 'Guest country', 'Nationality') ?? '')
  return {
    booking_ref:         String(pickRaw(raw, 'Reservation number', 'Booking number', 'Confirmation number', 'ID', 'Reference') ?? ''),
    booking_date:        parseDate(pickRaw(raw, 'Booked on', 'Book date', 'Booking date', 'Created')),
    check_in_date:            parseDate(pickRaw(raw, 'Arrival', 'Check-in', 'Check-in Date', 'arrival')),
    check_out_date:           parseDate(pickRaw(raw, 'Departure', 'Check-out', 'Check-out Date', 'departure')),
    guest_name:          String(pickRaw(raw, 'Guest name', 'Guest Name', 'Name', 'Booker name') ?? ''),
    guest_country:       countryCodeFromName(country),
    status:              normalizeStatus(pickRaw(raw, 'Status', 'Booking status', 'Reservation status')),
    gross_amount:        gross,
    platform_fee:        comm,
    net_payout:          net || Math.max(0, gross - comm),
    payment_credit_date: '',
    _listing:            String(pickRaw(raw, 'Property', 'property', 'Room type', 'Accommodation', 'Hotel name', 'Listing') ?? ''),
  }
}

function validateRow(r) {
  const errs = []
  if (!r.check_in_date)  errs.push('Missing check-in')
  if (!r.check_out_date) errs.push('Missing check-out')
  if (r.check_in_date && r.check_out_date && r.check_in_date >= r.check_out_date) errs.push('Check-out ≤ check-in')
  if (!r.gross_amount) errs.push('Missing amount')
  return errs
}

// ── component ─────────────────────────────────────────────────────────────────

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })

export default function BookingImport() {
  const [units,      setUnits]      = useState([])
  const [platform,   setPlatform]   = useState('airbnb')
  const [file,       setFile]       = useState(null)
  const [stage,      setStage]      = useState('upload')  // 'upload' | 'preview' | 'done'
  const [parsed,     setParsed]     = useState([])
  const [duplicates, setDuplicates] = useState(new Set())
  const [unitMap,    setUnitMap]    = useState({})        // listing → unit_id
  const [importing,  setImporting]  = useState(false)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [result,     setResult]     = useState(null)

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data ?? []))
  }, [])

  const uniqueListings = useMemo(() =>
    [...new Set(parsed.map(r => r._listing).filter(Boolean))]
  , [parsed])

  const enriched = useMemo(() =>
    parsed.map(r => ({
      ...r,
      unit_id: unitMap[r._listing] ?? '',
      _errors: validateRow(r),
    }))
  , [parsed, unitMap])

  const readyRows  = useMemo(() => enriched.filter(r => !r._errors.length && !duplicates.has(r.booking_ref) && r.unit_id), [enriched, duplicates])
  const dupRows    = useMemo(() => enriched.filter(r => r.booking_ref && duplicates.has(r.booking_ref)), [enriched, duplicates])
  const errorRows  = useMemo(() => enriched.filter(r => r._errors.length > 0), [enriched])
  const noUnitRows = useMemo(() => enriched.filter(r => !r.unit_id && !r._errors.length && !duplicates.has(r.booking_ref)), [enriched, duplicates])

  async function handleParse() {
    if (!file) return
    setParseError(null)
    setParseLoading(true)
    try {
      const XLSX   = (await import('xlsx')).default ?? (await import('xlsx'))
      const data   = await file.arrayBuffer()
      const wb     = XLSX.read(data, { type: 'array', cellDates: true })
      const ws     = wb.Sheets[wb.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rawRows.length) { setParseError('No data found in file.'); setParseLoading(false); return }

      const mapper = platform === 'airbnb' ? mapAirbnbRow : mapBookingRow
      const mapped = rawRows
        .map(mapper)
        .filter(r => r.check_in_date || r.check_out_date || r.guest_name || r.booking_ref)

      if (!mapped.length) {
        setParseError('No bookings found. Make sure the correct platform is selected and the file has the expected column headers.')
        setParseLoading(false)
        return
      }

      setParsed(mapped)

      // Auto-match listing names to unit names
      const listing = [...new Set(mapped.map(r => r._listing).filter(Boolean))]
      const autoMap = {}
      listing.forEach(name => {
        const match = units.find(u =>
          u.name.toLowerCase() === name.toLowerCase() ||
          name.toLowerCase().includes(u.name.toLowerCase()) ||
          u.name.toLowerCase().includes(name.toLowerCase())
        )
        autoMap[name] = match?.id ?? ''
      })
      setUnitMap(autoMap)

      // Duplicate detection by booking_ref
      const refs = [...new Set(mapped.map(r => r.booking_ref).filter(Boolean))]
      if (refs.length) {
        const { data: existing } = await supabase.from('bookings').select('booking_ref').in('booking_ref', refs)
        setDuplicates(new Set((existing ?? []).map(r => r.booking_ref)))
      } else {
        setDuplicates(new Set())
      }

      setStage('preview')
    } catch (err) {
      setParseError(`Parse failed: ${err.message}`)
    }
    setParseLoading(false)
  }

  async function handleImport() {
    setImporting(true)
    const toInsert = readyRows.map(r => ({
      unit_id:             r.unit_id,
      booking_ref:         r.booking_ref || null,
      booking_date:        r.booking_date || null,
      check_in_date:            r.check_in_date,
      check_out_date:           r.check_out_date,
      guest_name:          r.guest_name || null,
      guest_country:       r.guest_country || null,
      gross_amount:        r.gross_amount,
      platform_fee:        r.platform_fee || 0,
      other_fees:          0,
      net_payout:          r.net_payout,
      payment_credit_date: r.payment_credit_date || null,
      status:              r.status,
    }))

    let imported = 0, failed = 0
    for (let i = 0; i < toInsert.length; i += 50) {
      const { error } = await supabase.from('bookings').insert(toInsert.slice(i, i + 50))
      if (error) failed += Math.min(50, toInsert.length - i)
      else       imported += Math.min(50, toInsert.length - i)
    }

    setResult({ imported, skipped: dupRows.length, failed })
    setStage('done')
    setImporting(false)
  }

  function reset() {
    setFile(null); setParsed([]); setDuplicates(new Set())
    setUnitMap({}); setResult(null); setParseError(null); setStage('upload')
  }

  // ── upload ────────────────────────────────────────────────────────────────

  if (stage === 'upload') return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Import Bookings</h2>
        <p className="text-sm text-gray-500 mt-1">Upload a CSV or XLS export from your booking platform.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        <section className="px-6 py-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Platform</p>
          <div className="flex gap-3">
            {[
              { id: 'airbnb',      label: 'Airbnb',       hint: 'Reservations CSV export' },
              { id: 'booking_com', label: 'Booking.com',  hint: 'XLS or CSV export' },
            ].map(({ id, label, hint }) => (
              <button key={id} type="button" onClick={() => setPlatform(id)}
                className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${
                  platform === id
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`block text-sm font-medium ${platform === id ? 'text-brand-700' : 'text-gray-800'}`}>{label}</span>
                <span className="block text-xs text-gray-400 mt-0.5">{hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="px-6 py-5">
          <p className="text-sm font-medium text-gray-700 mb-2">File</p>
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={e => { setFile(e.target.files[0] ?? null); setParseError(null) }}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
          />
          {file && <p className="mt-2 text-xs text-gray-400">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
          {parseError && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{parseError}</div>
          )}
        </section>

        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end">
          <button
            onClick={handleParse}
            disabled={!file || parseLoading}
            className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {parseLoading ? 'Parsing…' : 'Parse file →'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── done ──────────────────────────────────────────────────────────────────

  if (stage === 'done') return (
    <div className="max-w-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Import complete</h2>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3 mb-5">
        <Row label="Imported"              value={result.imported} color="text-green-600" />
        <Row label="Skipped (duplicates)"  value={result.skipped}  color="text-gray-500"  />
        {result.failed > 0 && <Row label="Failed" value={result.failed} color="text-red-500" />}
      </div>
      <div className="flex gap-3">
        <button onClick={reset}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition">
          Import more
        </button>
      </div>
    </div>
  )

  // ── preview ───────────────────────────────────────────────────────────────

  const canImport = readyRows.length > 0 && noUnitRows.length === 0

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <h2 className="text-xl font-semibold text-gray-900">Preview — {parsed.length} rows parsed</h2>
        <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600 transition">← Back</button>
      </div>

      {/* Unit mapping */}
      {uniqueListings.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Map listings to units</h3>
          <div className="space-y-2">
            {uniqueListings.map(name => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-52 truncate shrink-0" title={name}>{name || '(blank)'}</span>
                <span className="text-gray-300 shrink-0">→</span>
                <select
                  value={unitMap[name] ?? ''}
                  onChange={e => setUnitMap(prev => ({ ...prev, [name]: e.target.value }))}
                  className={`${inputCls} flex-1 max-w-xs`}
                >
                  <option value="">Select unit…</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <span className={`text-xs font-medium shrink-0 ${unitMap[name] ? 'text-green-600' : 'text-orange-500'}`}>
                  {unitMap[name] ? '✓' : 'required'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Chip n={readyRows.length}  label="ready"                ring="border-green-200 bg-green-50 text-green-700" />
        {dupRows.length   > 0 && <Chip n={dupRows.length}   label="duplicate (skip)" ring="border-gray-200 bg-gray-50 text-gray-500" />}
        {errorRows.length > 0 && <Chip n={errorRows.length} label="error (skip)"     ring="border-red-200 bg-red-50 text-red-600" />}
        {noUnitRows.length > 0 && <Chip n={noUnitRows.length} label="no unit"        ring="border-orange-200 bg-orange-50 text-orange-600" />}
      </div>

      {/* Preview table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>State</Th>
                <Th>Ref</Th>
                <Th>Guest</Th>
                <Th>Unit</Th>
                <Th right>Check-in</Th>
                <Th right>Check-out</Th>
                <Th right>Gross</Th>
                <Th right>Net</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enriched.map((r, i) => {
                const isDup  = r.booking_ref && duplicates.has(r.booking_ref)
                const hasErr = r._errors.length > 0
                const noUnit = !r.unit_id && !hasErr && !isDup
                const unitLabel = units.find(u => u.id === r.unit_id)?.name ?? r._listing ?? '—'
                const bg = isDup ? 'opacity-50' : hasErr ? 'bg-red-50' : noUnit ? 'bg-orange-50' : ''
                return (
                  <tr key={i} className={`${bg} transition-colors`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isDup  ? <span className="text-gray-400">skip</span>
                      : hasErr ? <span className="text-red-500" title={r._errors.join('; ')}>⚠ {r._errors[0]}</span>
                      : noUnit ? <span className="text-orange-500">no unit</span>
                      : <span className="text-green-600 font-medium">✓</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{r.booking_ref || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.guest_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{unitLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.check_in_date  || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.check_out_date || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.gross_amount ? usd.format(r.gross_amount) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{r.net_payout ? usd.format(r.net_payout) : '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleImport}
          disabled={!canImport || importing}
          className="px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {importing
            ? 'Importing…'
            : `Import ${readyRows.length} booking${readyRows.length !== 1 ? 's' : ''}`
          }
        </button>
        {!canImport && noUnitRows.length > 0 && (
          <p className="text-sm text-orange-600">Map all listings to a unit before importing.</p>
        )}
        {!canImport && readyRows.length === 0 && noUnitRows.length === 0 && (
          <p className="text-sm text-gray-500">No valid rows to import.</p>
        )}
      </div>
    </div>
  )
}

// ── tiny sub-components ───────────────────────────────────────────────────────

function Th({ children, right }) {
  return (
    <th className={`${right ? 'text-right' : 'text-left'} px-3 py-2.5 font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap`}>
      {children}
    </th>
  )
}

function Chip({ n, label, ring }) {
  return (
    <div className={`rounded-lg border px-4 py-2 text-sm ${ring}`}>
      <span className="font-semibold">{n}</span>
      <span className="ml-1">{label}</span>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  )
}
