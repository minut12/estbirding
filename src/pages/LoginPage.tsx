import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bird } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sisselogimine ebaõnnestus',
        description: error.message === 'Invalid login credentials'
          ? 'Vale e-posti aadress või parool'
          : error.message,
      });
    } else {
      navigate('/', { replace: true });
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({
        variant: 'destructive',
        title: 'Sisesta e-posti aadress',
        description: 'Parooli lähtestamiseks sisesta oma e-posti aadress.',
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ variant: 'destructive', title: 'Viga', description: error.message });
    } else {
      toast({
        title: 'Parooli lähtestamine',
        description: 'Kontrolli oma e-posti, saatsime sulle parooli lähtestamise lingi.',
      });
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
          <p className="text-sm text-muted-foreground">Logi sisse oma kontoga</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength={6}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Laadimine...' : 'Logi sisse'}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-2 text-sm">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-primary hover:underline"
            disabled={loading}
          >
            Unustasid parooli?
          </button>
          <p className="text-muted-foreground">
            Pole kontot?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Registreeru
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
