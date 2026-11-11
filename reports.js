// Supabase 제보 조회/삭제
export default async function handler(req, res) {
  // 인증 체크
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase 환경변수 미설정' });
  }

  // GET: 제보 리스트
  if (req.method === 'GET') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/reports?select=*&order=id.desc`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({ error: 'Supabase 조회 실패: ' + errText });
      }

      const reports = await response.json();
      return res.status(200).json({ reports });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE: 제보 삭제
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID 필요' });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({ error: '삭제 실패: ' + errText });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
