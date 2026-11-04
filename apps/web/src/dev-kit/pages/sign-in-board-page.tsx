import type { ReactNode } from 'react';
import { signInHref } from '../../api/session-api';
import { ScreenPage } from '../../layout/screen-page';
import { AuthGateCard, SignInFailedCard, UniverseOpeningCard } from '../../pages/auth-cards';
import { Button } from '../../ui/button';
import './sign-in-board-page.css';

/**
 * Board S02-Login: the three states of /login side by side, as the board lays them out (A · on the way to the IdP,
 * B · back and opening the Universe, C · failed). The app shows one at a time (pages/login-page.tsx).
 */
export function SignInBoardPage(): ReactNode {
  const href = signInHref('vi', '/u');
  return (
    <ScreenPage
      code="S02-Login"
      veil="gate"
      layout="board"
      actions={
        <Button variant="glass" href="/" className="start-ghost">
          Về trang chủ
        </Button>
      }
    >
      <div className="s02-board">
        <AuthGateCard state="opening" href={href} kicker="A · Chuyển sang IdP" />
        <UniverseOpeningCard stage="universe" kicker="B · Đã quay về" />
        <SignInFailedCard reason="fail" retryHref={href} homeHref="/" kicker="C · Lỗi" />
      </div>
    </ScreenPage>
  );
}
