import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { fmtPoints } from '../lib/format';

// 會員端外框：上方有站名、選單、剩餘點數
export default function StudioLayout({ title, me, children }) {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/member/logout', { method: 'POST' });
    router.push('/login');
  };
  const nav = [['/studio', '🎬 做影片'], ['/batch', '📦 一次做好幾支'], ['/drama', '🎭 萬相短劇'], ['/points', '💎 我的點數']];

  return (
    <>
      <Head>
        <title>{`${title}｜1688影片工廠`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <header className="top">
        <div className="top-in">
          <Link href="/studio" className="brand">🎬 1688影片工廠</Link>
          <nav>
            {nav.map(([href, text]) => (
              <Link key={href} href={href} className={router.pathname === href ? 'on' : ''}>{text}</Link>
            ))}
          </nav>
          <Link href="/points" className="pts">💎 {me ? fmtPoints(me.points) : '…'} 點</Link>
          <span className="who">{me?.name}</span>
          <button className="btn sm" onClick={logout}>登出</button>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
