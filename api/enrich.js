// 식당 하나의 상세 정보(가격, 운영시간, 외부인 이용 여부, 메뉴 링크)를
// Gemini + Google 검색으로 찾아 돌려줍니다.
// 필요한 Vercel 환경 변수: GEMINI_API_KEY, ADMIN_PASSWORD
// 선택: GEMINI_MODEL (기본값 gemini-2.5-flash)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요.' });
  if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
  }
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았어요.' });

  const { name, address } = req.body || {};
  if (!name) return res.status(400).json({ error: '식당 이름이 필요해요.' });

  const prompt = `한국의 구내식당 정보를 웹에서 검색해서 정리해 줘.

식당 이름: ${name}
주소: ${address || '모름'}

찾아야 할 정보:
- price: 1인 식사 가격(원, 숫자만). 여러 가격이면 일반 점심 정식 가격. 모르면 null
- hours: 점심 운영시간 "11:00~13:30" 형식. 모르면 null
- outsider: 외부인(일반인) 이용 가능 여부. "가능", "불가", "모름" 중 하나
- menuType: 메뉴를 확인하는 곳. "insta"(인스타그램), "kakao"(카카오 채널/오픈채팅), "url"(블로그·홈페이지 등 웹페이지), 없으면 null
- menuLink: 메뉴를 확인할 수 있는 링크. 모르면 null
- note: 참고할 점 한두 문장 (예: 주말 휴무, 사원증 필요 등)

규칙:
- 검색 결과에서 확인된 내용만 쓰고, 추측하지 마. 확인 안 되면 null 또는 "모름".
- 최근 정보를 우선해.
- 반드시 아래 형식의 JSON 하나만 출력하고 다른 말은 쓰지 마.
{"price": 7000, "hours": "11:00~13:30", "outsider": "가능", "menuType": "url", "menuLink": "https://...", "note": "..."}`;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: 'Gemini 오류 (' + r.status + '): ' + ((data.error && data.error.message) || '').slice(0, 300) });
    }

    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    let info = {};
    if (match) {
      try { info = JSON.parse(match[0]); } catch (e) { info = {}; }
    }

    const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    const sources = chunks
      .filter(c => c.web && c.web.uri)
      .map(c => ({ title: c.web.title || c.web.uri, uri: c.web.uri }))
      .slice(0, 5);

    return res.status(200).json({ info, sources, raw: match ? undefined : text.slice(0, 500) });
  } catch (e) {
    return res.status(500).json({ error: 'AI 조회 중 오류: ' + e.message });
  }
};
