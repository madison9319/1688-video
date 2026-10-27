import { readSession } from '../lib/session';

// 首頁：登入了就進影片工廠，沒登入就到登入頁
export function getServerSideProps({ req }) {
  const s = readSession('member', req.headers.cookie);
  return { redirect: { destination: s ? '/studio' : '/login', permanent: false } };
}

export default function Home() {
  return null;
}
