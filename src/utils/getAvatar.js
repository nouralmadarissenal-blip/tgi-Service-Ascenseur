const PROFILE_BY_EMAIL = {
  'yl.younesslaassas@gmail.com': {
    name: 'Youness Laassas',
    avatar: '/Youness Laassas.jpeg',
  },
  'techniquegi39@gmail.com': {
    name: 'Khalid Laassas',
    avatar: '/Khalid Laassas.jpeg',
  },
}

function getProfile(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  return PROFILE_BY_EMAIL[normalizedEmail] || null
}

export default function getAvatar(email) {
  return getProfile(email)?.avatar || null
}

export function getProfileName(email) {
  return getProfile(email)?.name || ''
}
