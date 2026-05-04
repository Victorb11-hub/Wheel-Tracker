'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ResetPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <p className="mt-1 text-sm text-text-muted">
          We&rsquo;ll email you a reset link.
        </p>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-md border border-credit bg-credit-bg p-3 text-sm text-credit">
              If an account exists for that email, a reset link is on its way.
            </p>
            <Link
              href="/login"
              className="text-center text-sm text-credit hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required />
            </div>
            <Button type="submit" size="lg">
              Send reset link
            </Button>
            <p className="text-center text-sm text-text-muted">
              Remembered it?{' '}
              <Link href="/login" className="text-credit hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
