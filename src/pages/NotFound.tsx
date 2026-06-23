import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
      <span className="vaani-bindi" />
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="text-primary underline">
        Back to landing
      </Link>
    </main>
  );
}
