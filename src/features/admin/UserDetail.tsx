import { useState } from 'react';
import { ChevronLeft, Loader2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ADMIN_ERROR_TEXT,
  adminErrorMessage,
  formatSignIn,
  ROLE_LABEL,
  setAdminUserRole,
  setAdminUserStatus,
  type AdminRole,
  type AdminUser,
  type AdminUserStatus,
} from '@/features/admin/adminUsers';

const ROLE_ORDER: readonly AdminRole[] = ['user_level_1', 'user_level_2', 'admin'];

const CHIP_BASE_CLASS = 'inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-xs font-semibold';
const ROLE_CHIP_CLASS: Record<AdminRole, string> = {
  admin: 'bg-[#E6F0E9] text-[#24603D]',
  user_level_2: 'bg-[#EEF2EF] text-[#4A5951]',
  user_level_1: 'bg-[#EEF2EF] text-[#4A5951]',
};

const AVATAR_SELF_CLASS = 'bg-[#2D764B] text-white';
const AVATAR_OTHER_CLASS = 'bg-[#DCE6EC] text-[#2E4F63]';

const LABEL_CLASS = 'mb-2 ml-1 text-[13px] font-semibold text-[#5B6B62]';
const GROUP_CLASS = 'overflow-hidden rounded-[14px] border border-[#DFE6E1] bg-white';
const KV_CLASS = 'flex min-h-[46px] items-center justify-between gap-3 px-3.5 py-2';

const STATUS_BUTTON_DANGER_CLASS = 'border-[#F1C9C5] text-[#B42318]';
const STATUS_BUTTON_NEUTRAL_CLASS = 'border-[#DFE6E1] text-[#1F2723]';

const STATUS_TOAST: Record<AdminUserStatus, string> = {
  disabled: 'Juurdep\u00e4\u00e4s keelatud',
  active: 'Juurdep\u00e4\u00e4s taastatud',
};

function formatJoined(iso: string): string {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('et-EE') : '\u2013';
}

export type UserDetailHeaderProps = {
  onBack: () => void;
};

export function UserDetailHeader({ onBack }: UserDetailHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-[52px] items-center gap-1 border-b border-[#DFE6E1] bg-white px-2.5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 min-w-[84px] items-center gap-0.5 text-[15px] text-[#2D764B]"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        Kasutajad
      </button>
      <h1 className="flex-1 text-center text-[17px] font-semibold">Kasutaja</h1>
      <span className="min-w-[84px]" aria-hidden="true" />
    </header>
  );
}

export type UserDetailProps = {
  user: AdminUser;
  isSelf: boolean;
  onUserChange: (updated: AdminUser) => void;
  showBackHeader?: boolean;
  onBack?: () => void;
  /** 'page' = phone/full-page rendering (default); 'card' = desktop white card next to the list. */
  layout?: UserDetailLayout;
};

export type UserDetailLayout = 'page' | 'card';

export function UserDetail({
  user,
  isSelf,
  onUserChange,
  showBackHeader = false,
  onBack,
  layout = 'page',
}: UserDetailProps) {
  // Keyed by user id so a save still in flight for another user never locks this one.
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saving = savingId === user.id;

  const finishSaving = (id: string) => setSavingId((current) => (current === id ? null : current));

  const changeRole = async (role: AdminRole) => {
    if (isSelf || saving || role === user.role) return;
    const previous = user;
    setSavingId(previous.id);
    onUserChange({ ...previous, role });
    try {
      await setAdminUserRole(previous.id, role);
      toast.success('Roll muudetud');
    } catch (e: unknown) {
      // onUserChange is keyed by id, so this revert only ever touches the user that was edited.
      onUserChange(previous);
      toast.error(adminErrorMessage(e));
    } finally {
      finishSaving(previous.id);
    }
  };

  const applyStatus = async (next: AdminUserStatus) => {
    if (isSelf || saving) return;
    const target = user;
    setSavingId(target.id);
    try {
      await setAdminUserStatus(target.id, next);
      onUserChange({ ...target, status: next });
      toast.success(STATUS_TOAST[next]);
    } catch (e: unknown) {
      toast.error(adminErrorMessage(e));
    } finally {
      finishSaving(target.id);
    }
  };

  const onStatusClick = () => {
    if (isSelf || saving) return;
    if (user.status === 'active') {
      setConfirmOpen(true);
      return;
    }
    void applyStatus('active');
  };

  const name = user.displayName || user.email;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const isActive = user.status === 'active';
  const radiosDisabled = isSelf || saving;

  const avatarClass = isSelf ? AVATAR_SELF_CLASS : AVATAR_OTHER_CLASS;
  const statusLabel = isActive ? <>Keela juurdep&auml;&auml;s</> : <>Luba juurdep&auml;&auml;s</>;
  const statusNote = isActive && user.role === 'admin' ? ADMIN_ERROR_TEXT.adminBlock : null;
  const statusDisabled = saving || statusNote !== null;
  const statusButtonClass = isActive ? STATUS_BUTTON_DANGER_CLASS : STATUS_BUTTON_NEUTRAL_CLASS;
  const StatusIcon = saving ? Loader2 : isActive ? UserX : UserCheck;
  const statusIcon = (
    <StatusIcon className={`h-[18px] w-[18px]${saving ? ' animate-spin' : ''}`} aria-hidden="true" />
  );

  const confirmDialog = (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keelata juurdep&auml;&auml;s?</AlertDialogTitle>
          <AlertDialogDescription>
            {name} logitakse v&auml;lja hiljemalt tunni jooksul ja ta ei saa enam sisse logida.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>T&uuml;hista</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void applyStatus('disabled')}
            className="bg-[#B42318] text-white hover:bg-[#9A1F15]"
          >
            Keela juurdep&auml;&auml;s
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const roleChips = (
    <>
      <span className={`${CHIP_BASE_CLASS} ${ROLE_CHIP_CLASS[user.role]}`}>{ROLE_LABEL[user.role]}</span>
      {isSelf && <span className={`${CHIP_BASE_CLASS} bg-[#E6F0E9] text-[#24603D]`}>Sina</span>}
    </>
  );

  const kontoSection = (
    <section>
      <h2 className={LABEL_CLASS}>Konto</h2>
      <div className={`${GROUP_CLASS} divide-y divide-[#E8EEEA]`}>
        <div className={KV_CLASS}>
          <span className="text-[#3E4C44]">Liitus</span>
          <span className="font-medium tabular-nums">{formatJoined(user.createdAt)}</span>
        </div>
        <div className={KV_CLASS}>
          <span className="text-[#3E4C44]">Viimati sisse loginud</span>
          <span className="text-right font-medium tabular-nums">
            {user.lastSignInAt ? formatSignIn(user.lastSignInAt) : 'Pole sisse loginud'}
          </span>
        </div>
        <div className={KV_CLASS}>
          <span className="text-[#3E4C44]">Olek</span>
          <span className={`font-medium ${isActive ? 'text-[#24603D]' : 'text-[#B42318]'}`}>
            {isActive ? 'Aktiivne' : 'Keelatud'}
          </span>
        </div>
      </div>
    </section>
  );

  const rollSection = (
    <section>
      <h2 className={LABEL_CLASS}>Roll</h2>
      <div role="radiogroup" aria-label="Roll" className={`${GROUP_CLASS} divide-y divide-[#E8EEEA]`}>
        {ROLE_ORDER.map((role) => {
          const on = user.role === role;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={radiosDisabled}
              onClick={() => void changeRole(role)}
              className="flex w-full items-start gap-3 px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={`mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 ${
                  on ? 'border-[#2D764B]' : 'border-[#AEBBB3]'
                }`}
                aria-hidden="true"
              >
                {on && <span className="h-2.5 w-2.5 rounded-full bg-[#2D764B]" />}
              </span>
              <span className="flex-1 font-semibold">{ROLE_LABEL[role]}</span>
            </button>
          );
        })}
      </div>
      {isSelf && <p className="mx-1 mt-2 text-[13px] text-[#5B6B62]">Oma rolli ei saa muuta.</p>}
    </section>
  );

  if (layout === 'card') {
    return (
      <div className="text-[15px] leading-[1.4] text-[#1F2723]">
        {showBackHeader && onBack && <UserDetailHeader onBack={onBack} />}
        <div className="flex max-w-[620px] flex-col gap-[22px] rounded-2xl border border-[#DFE6E1] bg-white px-6 py-[22px]">
          <div className="flex items-center gap-4">
            <div
              className={`grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full text-[24px] font-semibold ${avatarClass}`}
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="break-all text-[20px] font-semibold">{name}</div>
              {user.displayName && user.email && (
                <div className="break-all text-[13px] text-[#5B6B62]">{user.email}</div>
              )}
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">{roleChips}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {kontoSection}
            {rollSection}
          </div>

          {!isSelf && (
            <div className={`flex items-center gap-3 ${statusNote ? 'justify-between' : 'justify-end'}`}>
              {statusNote && <p className="text-[13px] text-[#5B6B62]">{statusNote}</p>}
              <button
                type="button"
                onClick={onStatusClick}
                disabled={statusDisabled}
                className={`flex h-[38px] shrink-0 items-center justify-center gap-2 rounded-xl border bg-white px-4 font-semibold ${statusButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {statusIcon}
                {statusLabel}
              </button>
            </div>
          )}
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="text-[15px] leading-[1.4] text-[#1F2723]">
      {showBackHeader && onBack && <UserDetailHeader onBack={onBack} />}
      <div className="mx-auto flex max-w-[560px] flex-col gap-[22px] px-4 pb-6 pt-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className={`grid h-[76px] w-[76px] place-items-center rounded-full text-[30px] font-semibold ${
              avatarClass
            }`}
            aria-hidden="true"
          >
            {initial}
          </div>
          <div className="break-all text-xl font-semibold">{name}</div>
          {user.displayName && user.email && (
            <div className="break-all text-[13px] text-[#5B6B62]">{user.email}</div>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            {roleChips}
          </div>
        </div>

        {kontoSection}

        {rollSection}

        {!isSelf && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onStatusClick}
              disabled={statusDisabled}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-white font-semibold ${statusButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {statusIcon}
              {statusLabel}
            </button>
            {statusNote && <p className="mx-1 text-[13px] text-[#5B6B62]">{statusNote}</p>}
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
