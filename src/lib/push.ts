import { supabase } from './supabase'

// Pushmeldingen: de browser meldt zich aan bij zijn eigen pushdienst (Apple, Google, Mozilla)
// en wij bewaren dat adres, zodat de server elk uur kan melden dat er iets nieuws is.

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Op iPhone en iPad werkt het alleen in de app op je beginscherm (iOS 16.4 of nieuwer)
export function needsHomeScreen() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
  return ios && !standalone
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('De app is nog niet geïnstalleerd als web-app. Herlaad de pagina en probeer het opnieuw.')
  return reg
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Meldingen zijn geblokkeerd. Sta ze toe in de instellingen van je telefoon of browser.')
  }
  const res = await fetch('/api/push/key')
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.publicKey) throw new Error(body?.error ?? `Server gaf foutcode ${res.status}`)

  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(body.publicKey) }))
  const keys = sub.toJSON().keys ?? {}
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush(sub: PushSubscription) {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Server gaf foutcode ${res.status}`)
}

function base64ToBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}
