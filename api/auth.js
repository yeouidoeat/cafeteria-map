// 로그인 인증
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (!correctPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD 환경변수가 설정되지 않음' });
  }

  if (password === correctPassword) {
    // 간단한 토큰 생성 (실제 서비스는 JWT 추천)
    const token = Buffer.from(`admin:${Date.now()}:${Math.random()}`).toString('base64');
    return res.status(200).json({ success: true, token });
  }

  return res.status(401).json({ success: false, error: '비밀번호 틀림' });
}
