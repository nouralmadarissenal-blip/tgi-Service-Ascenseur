import { useState } from 'react'
import getAvatar from '../../utils/getAvatar'

const sizeClasses = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-24 w-24 text-2xl',
}

const DIRECTOR_EMAIL = 'techniquegi39@gmail.com'

function getInitials(name, email) {
  const source = String(name || email || 'Utilisateur').trim()
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase('fr'))
    .join('')
}

export default function UserAvatar({ email, name, role, size = 'md', className = '' }) {
  const isDirector =
    role === 'Directeur' || String(email || '').trim().toLowerCase() === DIRECTOR_EMAIL
  const src = isDirector ? '/khalid-avatar.jpeg' : getAvatar(email)
  const [failedSrc, setFailedSrc] = useState('')
  const dimensions = sizeClasses[size] || sizeClasses.md
  const imageClassName = `${dimensions} shrink-0 rounded-full border-2 ${
    isDirector ? 'border-blue-500' : 'border-white/30'
  } object-cover shadow-md ring-2 ring-blue-500/35 ${className}`

  if (src && failedSrc !== src) {
    return (
      <img
        alt={isDirector ? 'Khalid Laassas' : name ? `Photo de ${name}` : 'Photo de profil'}
        className={imageClassName}
        onError={() => setFailedSrc(src)}
        src={encodeURI(src)}
      />
    )
  }

  return (
    <span
      aria-label={name ? `Avatar de ${name}` : 'Avatar utilisateur'}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 font-semibold text-white shadow-md ring-2 ring-blue-500/35 ${dimensions} ${className}`}
      role="img"
    >
      {getInitials(name, email)}
    </span>
  )
}
