import Link from "next/link";
export default function AccessDenied() { return <main className="container py-5"><h1 className="h3">Accesso negato</h1><p>Il tuo ruolo non consente questa operazione.</p><Link href="/commesse">Torna alle commesse</Link></main>; }
