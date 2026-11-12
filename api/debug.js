// 환경변수 디버깅용 (임시)
export default async function handler(req, res) {

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  // 환경변수 체크
  const check = {
    SUPABASE_URL: SUPABASE_URL ? `있음 (${SUPABASE_URL.substring(0, 30)}...)` : '없음!',
    SUPABASE_KEY: SUPABASE_KEY ? `있음 (${SUPABASE_KEY.substring(0, 20)}...)` : '없음!',
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? '있음' : '없음!',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '있음' : '없음!',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? '있음' : '없음!'
  };

  // Supabase 실제 호출 테스트
  let supabaseTest = '시도 안 함';
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/reports?select=count`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'count=exact'
        }
      });
      supabaseTest = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text()
      };
    } catch (err) {
      supabaseTest = { error: err.message };
    }
  }

  return res.status(200).json({
    environment_check: check,
    supabase_test: supabaseTest,
    timestamp: new Date().toISOString()
  });
}
