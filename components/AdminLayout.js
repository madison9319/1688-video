import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const MENU = [
  ['/admin', '總覽'],
  ['/admin/members', '會員與點數'],
  ['/admin/ledger', '點數明細'],
  ['/admin/settings', '系統設定'],
  ['/admin/account', '修改密碼'],
];

export default function AdminLayout({ title, children }) {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const links = MENU.map(([href, text]) => (
    <Link key={href} href={href} className={router.pathname === href ? 'on' : ''}>{text}</Link>
  ));

  return (
    <>
      <Head>
        <title>{`${title}｜1688影片工廠後台`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div className="adm">
        <aside className="adm-side">
          <div className="brand">🎬 1688影片工廠 後台</div>
          {links}
          <div className="bottom">
            <a href="/studio" target="_blank" rel="noreferrer">↗ 打開影片工廠</a>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>登出</a>
          </div>
        </aside>
        <div style={{ minWidth: 0 }}>
          <nav className="adm-top">
            {links}
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>登出</a>
          </nav>
          <main className="adm-main">{children}</main>
        </div>
      </div>
    </>
  );
}
