export default function Footer({ className = '' }) {
  return (
    <footer className={`${className} mt-auto border-t border-slate-200/80 bg-white/75 px-4 py-4 backdrop-blur`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 sm:justify-between">
        <p className="text-center text-[11px] font-medium text-slate-500 sm:text-left">
          © 2026 TGI Ascenseurs - Développé par Youness Digital
        </p>
        <img
          alt="TGI Ascenseurs"
          className="h-6 w-auto object-contain grayscale opacity-50 transition-all hover:grayscale-0 hover:opacity-100"
          src="/logo.jpeg"
        />
      </div>
    </footer>
  )
}
