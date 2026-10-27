import { clearCookie } from '../../../lib/session';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearCookie('member'));
  res.status(200).json({ ok: true });
}
