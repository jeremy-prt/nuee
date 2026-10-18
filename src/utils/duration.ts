// « 8,4 s », « 12 s », « 3 min 05 s », « 1 h 02 min ». `precise` : une décimale sous les 10 secondes.
export function formatDuration(ms: number, locale: string, precise = false) {
  const unit = (value: number, unit: 'second' | 'minute' | 'hour', digits = 0) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: digits }).format(value)
  const seconds = Math.max(0, ms) / 1000
  if (seconds < 10 && precise) return unit(seconds, 'second', 1)
  const whole = Math.floor(seconds)
  if (whole < 60) return unit(whole, 'second')
  const minutes = Math.floor(whole / 60)
  if (minutes < 60) return `${unit(minutes, 'minute')} ${unit(whole % 60, 'second')}`
  return `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}`
}

const SINCE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
]

// « maintenant », « il y a 5 min », « hier », « il y a 4 j », puis la date : « 9 oct. », avec l'année si ce n'est
// pas celle en cours.
export function formatSince(at: number, now: number, locale: string) {
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  let value = Math.max(0, now - at) / 1000
  for (const [unit, size] of SINCE_UNITS) {
    if (value < size) return relative.format(unit === 'second' ? 0 : -Math.floor(value), unit)
    value /= size
  }
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear()
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }).format(at)
}

// Heure d'un message : « 14:32 » le jour même, « 18 oct., 14:32 » avant. `long` : date complète, pour une infobulle.
export function formatClock(at: number, locale: string, long = false) {
  if (long) return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(at)
  const sameDay = new Date(at).toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(locale, sameDay ? { timeStyle: 'short' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at)
}
