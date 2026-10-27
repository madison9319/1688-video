import { clearCookie } from '../../../lib/session';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearCookie('admin'));
  res.status(200).json({ ok: true });
}
