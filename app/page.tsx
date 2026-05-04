import { redirect } from 'next/navigation';

export default function Index() {
  // Fake auth: until Supabase is wired up, the app always redirects to /open
  // (the signed-off Open Positions tab). The login page is reachable directly
  // at /login for design review.
  redirect('/open');
}
