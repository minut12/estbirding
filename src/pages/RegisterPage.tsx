import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bird } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Parool liiga lühike',
        description: 'Parool peab olema vähemalt 6 tähemärki pikk.',
      });
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Registreerumine ebaõnnestus',
        description: error.message,
      });
    } else if (data.user && !data.session) {
      // Email confirmation required
      toast({
        title: 'Kontrolli e-posti',
        description: 'Saatsime kinnituslingi sinu e-posti aadressile. Kinnita see enne sisselogimist.',
      });
      navigate('/login', { replace: true });
    } else {
      // Auto-confirmed (if configured)
      navigate('/', { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Bird className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">EstBirding</h1>
          <p className="text-sm text-muted-foreground">Loo uus konto</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Nimi</Label>
            <Input
              id="displayName"
              type="text"
              placeholder="Sinu nimi"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              type="email"
              placeholder="sinu@email.ee"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Parool</Label>
            <Input
              id="password"
              type="password"
              placeholder="Vähemalt 6 tähemärki"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Laadimine...' : 'Registreeru'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Juba on konto?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Logi sisse
          </Link>
        </p>
      </div>
    </div>
  );
}
