import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import CountrySelect from '../ui/CountrySelect'

function formFromData(b) {
  return {
    unit_id:             String(b.unit_id ?? ''),
    platform_id:         String(b.platform_id ?? ''),
    booking_date:        b.booking_date ?? '',
    booking_ref:         b.booking_ref ?? '',
    check_in_date:            b.check_in_date ?? '',
    check_out_date:           b.check_out_date ?? '',
    guest_name:          b.guest_name ?? '',
    guest_country:       b.guest_country ?? '',
    guest_city:                b.guest_city ?? '',
    gross_amount:        String(b.gross_amount ?? ''),
    platform_fee:        String(b.platform_fee ?? ''),
    vat:                 String(b.vat ?? ''),
    other_fees:          String(b.other_fees ?? ''),
    net_payout:          String(b.net_payout ?? ''),
    payment_credit_date: b.payment_credit_date ?? '',
    status:              b.status ?? 'confirmed',
    notes:               b.notes ?? '',
  }
}

const EMPTY_FORM = {
  unit_id: '',
  platform_id: '',
  booking_date: '',
  booking_ref: '',
  check_in_date: '',
  check_out_date: '',
  guest_name: '',
  guest_country: '',
  guest_city: '',
  gross_amount: '',
  platform_fee: '',
  vat: '',
  other_fees: '',
  net_payout: '',
  payment_credit_date: '',
  status: 'confirmed',
  notes: '',
}

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition disabled:bg-gray-50 disabled:text-gray-500'

export default function BookingForm({ onSuccess, editData = null, onCancel }) {
  const [units, setUnits] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchLookups() {
      const [{ data: u }, { data: p }] = await Promise.all([
        supabase.from('units').select('id, name').order('name'),
        supabase.from('platforms').select('id, name').order('name'),
      ])
      setUnits(u ?? [])
      setPlatforms(p ?? [])
    }
    fetchLookups()
  }, [])

  useEffect(() => {
    setForm(editData ? formFromData(editData) : EMPTY_FORM)
    setSuccess(false)
    setSubmitError(null)
  }, [editData])

  // Auto-calculate net payout whenever fee fields change
  useEffect(() => {
    const gross = parseFloat(form.gross_amount) || 0
    const fee   = parseFloat(form.platform_fee) || 0
    const vat   = parseFloat(form.vat) || 0
    const other = parseFloat(form.other_fees) || 0
    if (gross > 0) {
      setForm(prev => ({ ...prev, net_payout: (gross - fee - vat - other).toFixed(2) }))
    }
  }, [form.gross_amount, form.platform_fee, form.vat, form.other_fees])

  function handle(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setSubmitError(null)

    const payload = {
      unit_id:             form.unit_id,
      platform_id:         form.platform_id || null,
      booking_date:        form.booking_date || null,
      booking_ref:         form.booking_ref || null,
      check_in_date:            form.check_in_date,
      check_out_date:           form.check_out_date,
      guest_name:          form.guest_name || null,
      guest_country:       form.guest_country || null,
      guest_city:                form.guest_city || null,
      gross_amount:        parseFloat(form.gross_amount),
      platform_fee:        parseFloat(form.platform_fee) || 0,
      other_fees:          parseFloat(form.other_fees) || 0,
      net_payout:          parseFloat(form.net_payout),
      payment_credit_date: form.payment_credit_date || null,
      status:              form.status,
      notes:               form.notes || null,
    }

    const { error } = editData
      ? await supabase.from('bookings').update(payload).eq('id', editData.id)
      : await supabase.from('bookings').insert(payload)

    if (error) {
      setSubmitError(error.message)
    } else {
      setSuccess(true)
      if (!editData) setForm(EMPTY_FORM)
      onSuccess?.()
      setTimeout(() => setSuccess(false), 4000)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{editData ? 'Edit Booking' : 'New Booking'}</h2>
        {!editData && <p className="text-sm text-gray-500 mt-1">Record a guest booking across any unit and platform.</p>}
      </div>

      {success && (
        <div className="mb-5 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {editData ? 'Booking updated.' : 'Booking saved successfully.'}
        </div>
      )}
      {submitError && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">

        {/* Unit & Platform */}
        <section className="px-6 py-5 grid grid-cols-2 gap-4">
          <Field label="Unit" required>
            <select name="unit_id" value={form.unit_id} onChange={handle} required className={inputClass}>
              <option value="">Select unit…</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Platform">
            <select name="platform_id" value={form.platform_id} onChange={handle} className={inputClass}>
              <option value="">Select platform…</option>
              {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Booking date" hint="Date the reservation was made">
            <input type="date" name="booking_date" value={form.booking_date} onChange={handle} className={inputClass} />
          </Field>
          <Field label="Booking ref" hint="Platform confirmation number">
            <input type="text" name="booking_ref" value={form.booking_ref} onChange={handle}
              placeholder="e.g. HMABCD1234" className={inputClass} />
          </Field>
        </section>

        {/* Dates & Guest */}
        <section className="px-6 py-5 grid grid-cols-2 gap-4">
          <Field label="Check-in" required>
            <input type="date" name="check_in_date" value={form.check_in_date} onChange={handle} required className={inputClass} />
          </Field>
          <Field label="Check-out" required>
            <input type="date" name="check_out_date" value={form.check_out_date} onChange={handle} required
              min={form.check_in_date} className={inputClass} />
          </Field>
          <Field label="Guest name" required>
            <input type="text" name="guest_name" value={form.guest_name} onChange={handle} required
              placeholder="Guest full name" className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" value={form.status} onChange={handle} className={inputClass}>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Guest country" hint="ISO code stored — used for guest origin analytics">
            <CountrySelect
              value={form.guest_country}
              onChange={code => setForm(prev => ({ ...prev, guest_country: code }))}
            />
          </Field>
          <Field label="Guest city" hint="Optional — home city of the guest">
            <input type="text" name="guest_city" value={form.guest_city} onChange={handle}
              placeholder="e.g. Seoul" className={inputClass} />
          </Field>
        </section>

        {/* Financials */}
        <section className="px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Financials</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Gross amount" required hint="Total charged to guest">
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
                <input type="number" name="gross_amount" value={form.gross_amount} onChange={handle}
                  required min="0" step="0.01" placeholder="0.00"
                  className={`${inputClass} pl-7`} />
              </div>
            </Field>
            <Field label="Platform fee" hint="Commission deducted by platform">
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
                <input type="number" name="platform_fee" value={form.platform_fee} onChange={handle}
                  min="0" step="0.01" placeholder="0.00"
                  className={`${inputClass} pl-7`} />
              </div>
            </Field>
            <Field label="VAT / Taxes" hint="Government taxes collected">
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
                <input type="number" name="vat" value={form.vat} onChange={handle}
                  min="0" step="0.01" placeholder="0.00"
                  className={`${inputClass} pl-7`} />
              </div>
            </Field>
            <Field label="Other fees" hint="Cleaning, damage deposit, etc.">
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
                <input type="number" name="other_fees" value={form.other_fees} onChange={handle}
                  min="0" step="0.01" placeholder="0.00"
                  className={`${inputClass} pl-7`} />
              </div>
            </Field>
          </div>

          {/* Net payout — auto-calculated, editable override */}
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 grid grid-cols-2 gap-4">
            <Field label="Net payout" required hint="Auto-calculated · override if needed">
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
                <input type="number" name="net_payout" value={form.net_payout} onChange={handle}
                  required step="0.01" placeholder="0.00"
                  className={`${inputClass} pl-7 font-semibold`} />
              </div>
            </Field>
            <Field label="Payment credit date" hint="When funds land in your account">
              <input type="date" name="payment_credit_date" value={form.payment_credit_date} onChange={handle}
                className={inputClass} />
            </Field>
          </div>
        </section>

        {/* Notes */}
        <section className="px-6 py-5">
          <Field label="Notes">
            <textarea name="notes" value={form.notes} onChange={handle} rows={2}
              placeholder="Any extra context for this booking…"
              className={`${inputClass} resize-none`} />
          </Field>
        </section>

        {/* Submit */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
          {onCancel ? (
            <button type="button" onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700 transition">
              Cancel
            </button>
          ) : (
            <button type="button" onClick={() => setForm(EMPTY_FORM)}
              className="text-sm text-gray-500 hover:text-gray-700 transition">
              Clear
            </button>
          )}
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            {loading ? 'Saving…' : (editData ? 'Update Booking' : 'Save Booking')}
          </button>
        </div>
      </form>
    </div>
  )
}
