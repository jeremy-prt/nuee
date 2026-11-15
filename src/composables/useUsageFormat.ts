import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { usageRate } from '@/ipc/usage'
import { DAY, HOUR, MINUTE } from '@/utils/usage'

// Les prix de l'API sont en dollars : affichés dans la monnaie de la langue, au taux du jour.
const CURRENCY: Record<string, string> = { fr: 'EUR', es: 'EUR', 'pt-BR': 'BRL', ja: 'JPY', 'zh-CN': 'CNY' }
const rates = reactive<Record<string, number | null>>({})

function loadRate(currency: string) {
  if (currency in rates) return
  rates[currency] = null
  usageRate(currency)
    .then((rate) => (rates[currency] = rate))
    .catch(() => {})
}

// Formats de la page Utilisation, dans la langue de l'interface.
export function useUsageFormat() {
  const { locale } = useI18n()
  const currency = computed(() => {
    const wanted = CURRENCY[locale.value]
    if (wanted) loadRate(wanted)
    return wanted && rates[wanted] ? { code: wanted, rate: rates[wanted]! } : { code: 'USD', rate: 1 }
  })
  const formats = computed(() => ({
    percent: new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }),
    cost: new Intl.NumberFormat(locale.value, { style: 'currency', currency: currency.value.code, maximumFractionDigits: 2 }),
    costRound: new Intl.NumberFormat(locale.value, { style: 'currency', currency: currency.value.code, maximumFractionDigits: 0 }),
    tokens: new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }),
    relative: new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }),
    weekdayTime: new Intl.DateTimeFormat(locale.value, { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
    weekday: new Intl.DateTimeFormat(locale.value, { weekday: 'short' }),
    time: new Intl.DateTimeFormat(locale.value, { hour: 'numeric', minute: '2-digit' }),
    hour: new Intl.DateTimeFormat(locale.value, { hour: 'numeric' }),
    day: new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }),
    dayLong: new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }),
  }))

  // Moins d'un jour : « dans 2 heures » ; au-delà, le jour et l'heure.
  function when(at: number, now = Date.now()) {
    const minutes = Math.max(1, Math.round((at - now) / MINUTE))
    if (minutes < 60) return formats.value.relative.format(minutes, 'minute')
    if (at - now < DAY) return formats.value.relative.format(Math.round((at - now) / HOUR), 'hour')
    return formats.value.weekdayTime.format(at)
  }

  const rate = computed(() => currency.value.rate)

  // Montant déjà converti ; au-delà de 100, les centimes n'apportent rien.
  function money(value: number) {
    return (value >= 100 ? formats.value.costRound : formats.value.cost).format(value)
  }

  // `usd` en dollars, tel que le donne la grille de prix.
  function cost(usd: number) {
    return money(usd * rate.value)
  }

  return { formats, when, cost, money, rate }
}
