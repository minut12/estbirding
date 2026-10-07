import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { clearAppCaches, fullReset, doSoftReload, doHardReload, type ResetReport } from '@/lib/cache-reset';
import { APP_VERSION } from '@/lib/version';
import {
  Trash2, RotateCcw, LogOut, Users, MapPin, Bird, Rss, Activity, LifeBuoy, ChevronRight, Wrench,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';
import AvatarManager from './AvatarManager';
import DeveloperSettings from './DeveloperSettings';
import NewsSourcesSettings from './NewsSourcesSettings';
import EventLog from './EventLog';
import NotificationSettingsCard from './NotificationSettingsCard';
import { LINNULIIGID_SCOPE, RARILIIN_SCOPE } from '@/lib/mapScope';
import { refreshSpeciesMetaFromCloud } from '@/lib/speciesMetaCloud';
import { getSupabaseConfigSource, isDeveloperModeEnabled, setDeveloperModeEnabled } from '@/config/supabaseConfig';
import { broadcastGpsConfigToMapIframes } from '@/config/gpsConfig';

type ResetMode = 'soft' | 'hard' | null;
type SettingsPage = 'home' | 'news' | 'species' | 'event_log';

const SETTINGS_GROUP_CLASS = 'rounded-[14px] border border-border bg-card overflow-hidden divide-y divide-border';
const SETTINGS_ROW_CLASS = 'min-h-[58px] px-3.5 py-2.5 flex items-center gap-3 w-full text-left disabled:opacity-50';

type IconTileVariant = 'accent' | 'muted' | 'destructive';

const ICON_TILE_VARIANT_CLASS: Record<IconTileVariant, string> = {
  accent: 'bg-accent text-primary',
  muted: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive/10 text-destructive',
};

interface IconTileProps {
  icon: LucideIcon;
  variant: IconTileVariant;
}

function IconTile({ icon: Icon, variant }: IconTileProps) {
  return (
    <div className={`w-8 h-8 rounded-[9px] grid place-items-center shrink-0 ${ICON_TILE_VARIANT_CLASS[variant]}`}>
      <Icon className="w-[18px] h-[18px]" />
    </div>
  );
}

interface RowTextProps {
  title: ReactNode;
  sub?: ReactNode;
  titleClassName?: string;
}

function RowText({ title, sub, titleClassName }: RowTextProps) {
  return (
    <div className="flex-1 min-w-0">
      <div className={`font-medium${titleClassName ? ` ${titleClassName}` : ''}`}>{title}</div>
      {sub && <div className="text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

interface SettingsLinkRowProps {
  icon: LucideIcon;
  title: ReactNode;
  sub: ReactNode;
  onClick: () => void;
}

function SettingsLinkRow({ icon, title, sub, onClick }: SettingsLinkRowProps) {
  return (
    <button type="button" className={SETTINGS_ROW_CLASS} onClick={onClick}>
      <IconTile icon={icon} variant="accent" />
      <RowText title={title} sub={sub} />
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

interface SettingsSectionProps {
  label: ReactNode;
  children: ReactNode;
}

function SettingsSection({ label, children }: SettingsSectionProps) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-muted-foreground mb-2 ml-1">{label}</h3>
      {children}
    </section>
  );
}

const DESKTOP_SETTINGS_QUERY = '(min-width: 901px)';

// Copied from NewsTab (do not import across features)
function useIsDesktopSettings(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(DESKTOP_SETTINGS_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(DESKTOP_SETTINGS_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

interface DesktopNavItemProps {
  icon: LucideIcon;
  label: ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function DesktopNavItem({ icon: Icon, label, isActive, onClick }: DesktopNavItemProps) {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={`h-10 px-2.5 rounded-[10px] flex items-center gap-2.5 text-[14.5px] hover:bg-muted${isActive ? ' bg-card font-semibold ring-1 ring-border' : ''}`}
    >
      <Icon className={`w-[18px] h-[18px] shrink-0${isActive ? ' text-primary' : ''}`} />
      {label}
    </button>
  );
}

const DESKTOP_NAV_GROUP_LABEL_CLASS = 'text-[12.5px] font-semibold text-muted-foreground ml-2.5 mb-1.5';

export default function SettingsTab() {
  const { user, role, isAdmin: isAdminUser, hasPermission, signOut } = useAuth();
  const navigate = useNavigate();
  const newsSourcesSectionRef = useRef<HTMLDivElement | null>(null);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('home');
  const [devMode, setDevMode] = useState<boolean>(() => isDeveloperModeEnabled());
  const [devTapCount, setDevTapCount] = useState(0);
  const [speciesScope, setSpeciesScope] = useState<'ee' | 'rariliin'>('ee');
  const [form, setForm] = useState<AppSettings>(loadSettings);
  const [confirmMode, setConfirmMode] = useState<ResetMode>(null);
  const [resetting, setResetting] = useState(false);
  const canManageSettings = isAdminUser || hasPermission(PERMISSIONS.settingsManage);
  const canSeeAdminLinks = isAdminUser || hasPermission(PERMISSIONS.settingsLinksAdmin);
  const isFree = role === 'user_level_1';
  const isDesktop = useIsDesktopSettings();

  useEffect(() => {
    setForm(loadSettings());
    refreshSpeciesMetaFromCloud({ force: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshSpeciesMetaFromCloud().catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || settingsPage !== 'news') return;
    if (!newsSourcesSectionRef.current) {
      console.warn('[Settings] News sources section did not render while settings page is open');
    }
  }, [settingsPage]);

  const onVersionTap = () => {
    if (devMode) return;
    const next = devTapCount + 1;
    setDevTapCount(next);
    if (next >= 7) {
      setDeveloperModeEnabled(true);
      setDevMode(true);
      setDevTapCount(0);
      toast.success('Developer mode enabled');
    }
  };

  const handleGpsToggle = (checked: boolean) => {
    const next = { ...form, gpsEnabled: checked };
    setForm(next);
    saveSettings(next);
    broadcastGpsConfigToMapIframes();
    toast.success(checked ? 'GPS-asukoht on lubatud' : 'GPS-asukoht on välja lülitatud');
  };

  const showReport = (report: ResetReport) => {
    if (report.errors.length > 0) {
      toast.warning('Osaline t\u00fchjendus', {
        description: report.errors.join('; '),
        duration: 4000,
      });
    } else {
      toast.success('Vahem\u00e4lu t\u00fchjendatud. Laen uuesti...');
    }
  };

  const handleReset = async () => {
    const mode = confirmMode;
    setConfirmMode(null);
    if (!mode) return;
    setResetting(true);
    try {
      const report = mode === 'soft' ? await clearAppCaches() : await fullReset();
      showReport(report);
      await new Promise((r) => setTimeout(r, 800));
      if (mode === 'soft') doSoftReload(); else doHardReload();
    } catch {
      toast.error('Tühjendamine ebaõnnestus');
      setResetting(false);
    }
  };

  const renderSettingsHeader = (title: string) => (
    <div className="mb-3 mt-1 flex items-center justify-between gap-3">
      <Button variant="outline" onClick={() => setSettingsPage('home')} className="rounded-xl px-3 py-2">
        ← Tagasi
      </Button>
      <div className="text-lg font-extrabold">{title}</div>
      <div className="w-11" />
    </div>
  );

  const renderSettingsNews = () => (
    <div ref={newsSourcesSectionRef} className="block">
      <NewsSourcesSettings />
    </div>
  );

  const renderSettingsSpecies = () => {
    const scope = speciesScope === 'rariliin' ? RARILIIN_SCOPE : LINNULIIGID_SCOPE;
    const scopeOptions: ReadonlyArray<{ value: 'ee' | 'rariliin'; label: string }> = [
      { value: 'ee', label: 'Linnuliigid (EE)' },
      { value: 'rariliin', label: 'Rariliin' },
    ];
    return (
      <>
        <div className="flex bg-muted rounded-[10px] p-[3px] mb-4">
          {scopeOptions.map((opt) => {
            const isActive = speciesScope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSpeciesScope(opt.value)}
                className={`flex-1 rounded-[8px] py-1.5 text-sm ${isActive ? 'bg-card shadow-sm font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <AvatarManager key={scope.id} scope={scope} />
      </>
    );
  };
  const renderSettingsEventLog = () => (
    <div className="flex flex-col gap-[22px]">
      <SettingsSection label="Teavitused selles seadmes">
        <NotificationSettingsCard variant="status" />
      </SettingsSection>

      <SettingsSection label={'S\u00fcndmuste logi'}>
        <EventLog />
      </SettingsSection>

      <SettingsSection label="Arendaja">
        <div className={SETTINGS_GROUP_CLASS}>
          <div className={SETTINGS_ROW_CLASS}>
            <IconTile icon={Wrench} variant="muted" />
            <RowText
              title={'Arendaja re\u017eiim'}
              sub={
                <>
                  <div>{'Supabase\'i asendus ja admin-v\u00f5ti'}</div>
                  {getSupabaseConfigSource() === 'override' && (
                    <div className="text-amber-700 dark:text-amber-400">{'Supabase\'i asendus on aktiivne'}</div>
                  )}
                </>
              }
            />
            <Switch
              checked={devMode}
              onCheckedChange={(v) => { setDeveloperModeEnabled(v); setDevMode(v); }}
              aria-label={'Arendaja re\u017eiim'}
            />
          </div>
        </div>
        {devMode && (
          <div className="mt-3">
            <DeveloperSettings />
          </div>
        )}
      </SettingsSection>
    </div>
  );

  const renderDebugLite = () => (
    <>
      <div className={SETTINGS_GROUP_CLASS}>
        <button
          type="button"
          className={SETTINGS_ROW_CLASS}
          disabled={resetting}
          onClick={() => setConfirmMode('soft')}
        >
          <IconTile icon={RotateCcw} variant="muted" />
          <RowText
            title={<>T&uuml;hjenda vahem&auml;lu</>}
            sub={<>Laeb uusima versiooni, seaded j&auml;&auml;vad alles</>}
          />
        </button>
        <button
          type="button"
          className={SETTINGS_ROW_CLASS}
          disabled={resetting}
          onClick={() => setConfirmMode('hard')}
        >
          <IconTile icon={Trash2} variant="destructive" />
          <RowText
            title={<>L&auml;htesta rakendus</>}
            titleClassName="text-destructive"
            sub={<>Kustutab k&otilde;ik seaded ja vahem&auml;lu</>}
          />
        </button>
        <a
          href="/reset/"
          aria-disabled={resetting || undefined}
          className={`${SETTINGS_ROW_CLASS}${resetting ? ' pointer-events-none opacity-50' : ''}`}
        >
          <IconTile icon={LifeBuoy} variant="muted" />
          <RowText
            title={<>Taastamisleht</>}
            sub={<>Kui rakendus on kinni j&auml;&auml;nud ja nupud ei t&ouml;&ouml;ta</>}
          />
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </a>
      </div>
      {resetting && <p className="text-sm text-muted-foreground animate-pulse ml-1 mt-2">T&uuml;hjendan...</p>}
    </>
  );

  const roleLabel = role === 'admin' ? 'Admin' : role === 'user_level_2' ? 'Tase 2' : 'Tase 1';
  const avatarLetter = (user?.email ?? '').charAt(0).toUpperCase();

  const renderSettingsHome = (opts?: { showProfile?: boolean }) => (
    <div className="flex flex-col gap-[22px]">
      {opts?.showProfile !== false && (
        <div className="flex items-center gap-3">
          <div className="w-[52px] h-[52px] rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold text-lg shrink-0">
            {avatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{user?.email}</div>
            <span className="inline-flex rounded-full bg-accent text-primary text-xs font-medium px-2 py-0.5 mt-1">
              {roleLabel}
            </span>
          </div>
        </div>
      )}

      {!isFree && (
        <SettingsSection label="Teavitused">
          <div className={SETTINGS_GROUP_CLASS}>
            <NotificationSettingsCard variant="row" />
          </div>
        </SettingsSection>
      )}

      {!isFree && (
        <SettingsSection label="Kaart">
          <div className={SETTINGS_GROUP_CLASS}>
            <div className={SETTINGS_ROW_CLASS}>
              <IconTile icon={MapPin} variant="accent" />
              <RowText title={<>N&auml;ita minu asukohta</>} sub={<>GPS Linnuliigid (EE) kaardil</>} />
              <Switch
                checked={form.gpsEnabled}
                onCheckedChange={handleGpsToggle}
                aria-label="N&auml;ita minu asukohta"
              />
            </div>
          </div>
        </SettingsSection>
      )}

      {canManageSettings && (
        <SettingsSection label="Haldus">
          <div className={SETTINGS_GROUP_CLASS}>
            {canSeeAdminLinks && (
              <SettingsLinkRow
                icon={Users}
                title={<>Kasutajad</>}
                sub={<>Rollid ja paketid</>}
                onClick={() => navigate('/admin/users')}
              />
            )}
            <SettingsLinkRow
              icon={Bird}
              title={<>Liigid</>}
              sub={<>Linnuliigid (EE) ja Rariliin</>}
              onClick={() => setSettingsPage('species')}
            />
            <SettingsLinkRow
              icon={Rss}
              title={<>Uudiste allikad</>}
              sub={<>RSS-allikad ja t&otilde;lge</>}
              onClick={() => setSettingsPage('news')}
            />
            <SettingsLinkRow
              icon={Activity}
              title={<>Diagnostika</>}
              sub={<>S&uuml;ndmuste logi, testteavitus, arendaja</>}
              onClick={() => setSettingsPage('event_log')}
            />
          </div>
        </SettingsSection>
      )}

      <SettingsSection label={<>T&otilde;rkeotsing</>}>
        {renderDebugLite()}
      </SettingsSection>

      <div className={SETTINGS_GROUP_CLASS}>
        <button type="button" className={SETTINGS_ROW_CLASS} onClick={() => signOut()}>
          <IconTile icon={LogOut} variant="destructive" />
          <RowText title={<>Logi v&auml;lja</>} titleClassName="text-destructive" />
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground cursor-default select-none" onClick={onVersionTap}>
        EstBirds &middot; versioon {APP_VERSION}
      </p>
    </div>
  );

  const renderSettings = () => {
    if (settingsPage === 'home') return renderSettingsHome();
    if (!canManageSettings) return renderSettingsHome();
    if (settingsPage === 'news') return <>{renderSettingsHeader('Uudiste allikad')}{renderSettingsNews()}</>;
    if (settingsPage === 'species') return <>{renderSettingsHeader('Liigid')}{renderSettingsSpecies()}</>;
    if (settingsPage === 'event_log') return <>{renderSettingsHeader('Diagnostika')}{renderSettingsEventLog()}</>;
    return renderSettingsHome();
  };

  const renderDesktopPage = (title: string, body: ReactNode) => (
    <>
      <h2 className="text-lg font-semibold">{title}</h2>
      {body}
    </>
  );

  const renderDesktopContent = () => {
    if (settingsPage === 'home') return renderSettingsHome({ showProfile: false });
    if (!canManageSettings) return renderSettingsHome({ showProfile: false });
    if (settingsPage === 'news') return renderDesktopPage('Uudiste allikad', renderSettingsNews());
    if (settingsPage === 'species') return renderDesktopPage('Liigid', renderSettingsSpecies());
    if (settingsPage === 'event_log') return renderDesktopPage('Diagnostika', renderSettingsEventLog());
    return renderSettingsHome({ showProfile: false });
  };

  const renderDesktopNav = () => (
    <nav aria-label="Seadete jaotised" className="flex-[1_1_220px] max-w-[240px] flex flex-col gap-[18px]">
      <div className="flex flex-col">
        <div className={DESKTOP_NAV_GROUP_LABEL_CLASS}>Minu seaded</div>
        <DesktopNavItem
          icon={Settings}
          label={<>&Uuml;ldine</>}
          isActive={settingsPage === 'home'}
          onClick={() => setSettingsPage('home')}
        />
      </div>
      <div className="flex flex-col">
        <div className={DESKTOP_NAV_GROUP_LABEL_CLASS}>Haldus</div>
        {canSeeAdminLinks && (
          <DesktopNavItem
            icon={Users}
            label={<>Kasutajad</>}
            isActive={false}
            onClick={() => navigate('/admin/users')}
          />
        )}
        <DesktopNavItem
          icon={Bird}
          label={<>Liigid</>}
          isActive={settingsPage === 'species'}
          onClick={() => setSettingsPage('species')}
        />
        <DesktopNavItem
          icon={Rss}
          label={<>Uudiste allikad</>}
          isActive={settingsPage === 'news'}
          onClick={() => setSettingsPage('news')}
        />
        <DesktopNavItem
          icon={Activity}
          label={<>Diagnostika</>}
          isActive={settingsPage === 'event_log'}
          onClick={() => setSettingsPage('event_log')}
        />
      </div>
    </nav>
  );

  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="border-b border-border bg-card">
          <div className="mx-auto max-w-[1080px] px-6 min-h-[60px] flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xl font-semibold">Seaded</h2>
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex rounded-full bg-accent text-primary text-xs font-medium px-2 py-0.5">
                {roleLabel}
              </span>
              <span className="text-[13px] text-muted-foreground">{user?.email}</span>
              <div className="h-[34px] w-[34px] rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold text-sm shrink-0">
                {avatarLetter}
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/40">
          <div className="mx-auto max-w-[1080px] px-6 pt-7 pb-12 flex flex-wrap items-start gap-8">
            {canManageSettings && renderDesktopNav()}
            <div className={`flex-[999_1_560px] min-w-0 max-w-[680px] flex flex-col gap-[26px]${canManageSettings ? '' : ' mx-auto'}`}>
              {renderDesktopContent()}
            </div>
          </div>
        </div>

        <AlertDialog open={confirmMode !== null} onOpenChange={(open) => { if (!open) setConfirmMode(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmMode === 'hard' ? 'L\u00e4htesta rakendus' : 'T\u00fchjenda vahem\u00e4lu'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmMode === 'hard'
                  ? 'K\u00f5ik salvestatud seaded ja vahem\u00e4lu kustutatakse. Rakendus laaditakse uuesti.'
                  : 'Vahem\u00e4lu t\u00fchjendatakse ja rakendus laaditakse uuesti. Seaded j\u00e4\u00e4vad alles.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>T&uuml;hista</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>
                {confirmMode === 'hard' ? 'L\u00e4htesta' : 'T\u00fchjenda'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Seaded</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-muted/40 p-4 space-y-6 max-h-[calc(100dvh-124px)] md:max-h-none pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {renderSettings()}
      </div>

      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => { if (!open) setConfirmMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'hard' ? 'L\u00e4htesta rakendus' : 'T\u00fchjenda vahem\u00e4lu'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'hard'
                ? 'Kõik salvestatud seaded ja vahemälu kustutatakse. Rakendus laaditakse uuesti.'
                : 'Vahemälu tühjendatakse ja rakendus laaditakse uuesti. Seaded jäävad alles.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>T&uuml;hista</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {confirmMode === 'hard' ? 'L\u00e4htesta' : 'T\u00fchjenda'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
