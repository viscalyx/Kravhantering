export default function GlobalNotFound() {
  return (
    <main className="section-padding min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gradient">404</h1>
        <p className="mt-4 text-lg text-secondary-700 dark:text-secondary-300">
          Sidan kunde inte hittas / Page not found
        </p>
        <a className="btn-primary mt-8 inline-block" href="/sv">
          Gå till startsidan
        </a>
      </div>
    </main>
  )
}
